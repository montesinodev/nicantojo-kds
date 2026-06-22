import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, restaurant_id } = await req.json();

    // 1. Validate inputs
    if (!email || !restaurant_id) {
      return new Response(
        JSON.stringify({ error: "Se requiere email y restaurant_id." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Verify the caller is an authenticated owner of this restaurant
    //    Use the anon client with the caller's JWT to check membership
    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(
        JSON.stringify({ error: "No autenticado." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: ownerMembership } = await callerClient
      .from("memberships")
      .select("id")
      .eq("user_id", caller.id)
      .eq("restaurant_id", restaurant_id)
      .eq("role", "owner")
      .maybeSingle();

    if (!ownerMembership) {
      return new Response(
        JSON.stringify({ error: "No tienes permiso para invitar staff a este restaurante." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Use the service role client for admin operations
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 4. Check if a user with this email already exists
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    let staffUserId: string;

    if (existingUser) {
      // User already has an account — just link them as staff
      staffUserId = existingUser.id;
    } else {
      // Invite them — they'll get an email to set their password
      const { data: inviteData, error: inviteError } =
        await adminClient.auth.admin.inviteUserByEmail(email, {
          data: { invited_as: "staff" },
        });

      if (inviteError || !inviteData?.user) {
        console.error("Invite error:", inviteError);
        return new Response(
          JSON.stringify({ error: inviteError?.message || "Error al enviar invitación." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      staffUserId = inviteData.user.id;

      // Also create their profile row (handle_new_user trigger may not fire for invites)
      await adminClient.from("profiles").upsert({
        id: staffUserId,
        full_name: email.split("@")[0], // placeholder until they fill it in
        phone: null,
      });
    }

    // 5. Check they're not already staff at this restaurant
    const { data: existingMembership } = await adminClient
      .from("memberships")
      .select("id")
      .eq("user_id", staffUserId)
      .eq("restaurant_id", restaurant_id)
      .maybeSingle();

    if (existingMembership) {
      return new Response(
        JSON.stringify({ error: "Este usuario ya es miembro de este restaurante." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Insert the staff membership
    const { error: membershipError } = await adminClient
      .from("memberships")
      .insert({ user_id: staffUserId, restaurant_id, role: "staff" });

    if (membershipError) {
      console.error("Membership insert error:", membershipError);
      return new Response(
        JSON.stringify({ error: membershipError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: existingUser
          ? `${email} agregado como staff. Ya tiene cuenta y puede iniciar sesión.`
          : `Invitación enviada a ${email}. Recibirá un correo para configurar su acceso.`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
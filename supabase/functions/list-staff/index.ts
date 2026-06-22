import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { restaurant_id } = await req.json();

    if (!restaurant_id) {
      return new Response(
        JSON.stringify({ error: "Se requiere restaurant_id." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Verify caller is owner of this restaurant
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
        JSON.stringify({ error: "No tienes permiso." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Use service role to get staff memberships + their emails from auth
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: memberships } = await adminClient
      .from("memberships")
      .select("id, user_id")
      .eq("restaurant_id", restaurant_id)
      .eq("role", "staff");

    if (!memberships?.length) {
      return new Response(
        JSON.stringify({ staff: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Fetch each user's email from auth.admin
    const staffWithEmail = await Promise.all(
      memberships.map(async (m) => {
        const { data } = await adminClient.auth.admin.getUserById(m.user_id);
        return {
          id: m.id,
          user_id: m.user_id,
          email: data?.user?.email || "Sin correo",
          invited_at: data?.user?.invited_at || null,
          last_sign_in: data?.user?.last_sign_in_at || null,
        };
      })
    );

    return new Response(
      JSON.stringify({ staff: staffWithEmail }),
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
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    // 1. Parse request body
    const { restaurant_id, delivery_address, delivery_coords, items } =
      await req.json();

    // 2. Basic input validation before hitting the DB
    if (!restaurant_id || !delivery_address || !delivery_coords || !items?.length) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: restaurant_id, delivery_address, delivery_coords, items" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Build a Supabase client that inherits the caller's auth token
    //    This means auth.uid() inside place_order_atomic resolves correctly
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    // 4. Call the atomic SQL function
    const { data, error } = await supabase.rpc("place_order_atomic", {
      p_restaurant_id:    restaurant_id,
      p_delivery_address: delivery_address,
      p_delivery_coords:  delivery_coords,
      p_items:            items,
    });

    if (error) {
      console.error("place_order_atomic error:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Return the new order ID
    return new Response(
      JSON.stringify({ order_id: data }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
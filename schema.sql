


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."order_status" AS ENUM (
    'pending',
    'preparing',
    'ready',
    'on_the_way',
    'delivered',
    'cancelled'
);


ALTER TYPE "public"."order_status" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'customer',
    'admin',
    'rider'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_restaurant"("p_name" "text", "p_address" "text", "p_image_url" "text" DEFAULT NULL::"text", "p_categories" "text" DEFAULT NULL::"text", "p_delivery_time" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id       uuid;
  v_restaurant_id uuid;
BEGIN

  -- 1. Must be authenticated
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to create a restaurant.';
  END IF;

  -- 2. Validate required fields
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Restaurant name is required.';
  END IF;

  IF p_address IS NULL OR length(trim(p_address)) = 0 THEN
    RAISE EXCEPTION 'Restaurant address is required.';
  END IF;

  -- 3. Insert the restaurant
  INSERT INTO public.restaurants (name, address, image_url, categories, delivery_time, is_open)
  VALUES (
    trim(p_name),
    trim(p_address),
    p_image_url,
    p_categories,
    p_delivery_time,
    true
  )
  RETURNING id INTO v_restaurant_id;

  -- 4. Insert the caller as owner in memberships
  INSERT INTO public.memberships (user_id, restaurant_id, role)
  VALUES (v_user_id, v_restaurant_id, 'owner');

  RETURN v_restaurant_id;

END;
$$;


ALTER FUNCTION "public"."create_restaurant"("p_name" "text", "p_address" "text", "p_image_url" "text", "p_categories" "text", "p_delivery_time" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_cart_snapshot_immutability"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    IF OLD.cart_snapshot IS DISTINCT FROM NEW.cart_snapshot THEN
        RAISE EXCEPTION 'PHASE 4 ENFORCEMENT: cart_snapshot is immutable and cannot be modified after order creation.';
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_cart_snapshot_immutability"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, phone)
    VALUES (
        new.id,
        new.raw_user_meta_data->>'full_name',
        -- Use NULL if phone is missing, rather than a magic string
        NULLIF(new.phone, '')
    );
    RETURN new;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_restaurant_member"("target_restaurant_id" "uuid", "required_role" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.memberships
        WHERE user_id = auth.uid()
          AND restaurant_id = target_restaurant_id
          AND (required_role IS NULL OR role = required_role)
    );
END;
$$;


ALTER FUNCTION "public"."is_restaurant_member"("target_restaurant_id" "uuid", "required_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_restaurant_owner"("target_restaurant_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    RETURN public.is_restaurant_member(target_restaurant_id, 'owner');
END;
$$;


ALTER FUNCTION "public"."is_restaurant_owner"("target_restaurant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."place_order_atomic"("p_restaurant_id" "uuid", "p_delivery_address" "text", "p_delivery_coords" "jsonb", "p_items" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_customer_id    uuid;
  v_order_id       uuid;
  v_total          integer := 0;
  v_item           jsonb;
  v_menu_item      record;
  v_cart_snapshot  jsonb   := '[]'::jsonb;
BEGIN

  -- 1. Caller must be authenticated
  v_customer_id := auth.uid();
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to place an order.';
  END IF;

  -- 2. Items array must not be empty
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order must contain at least one item.';
  END IF;

  -- 3. Restaurant must exist and be open
  IF NOT EXISTS (
    SELECT 1 FROM public.restaurants
    WHERE id = p_restaurant_id AND is_open = true
  ) THEN
    RAISE EXCEPTION 'Restaurant is not available.';
  END IF;

  -- 4. Validate every item, accumulate total, build cart_snapshot
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT id, name, price_cordobas, restaurant_id, is_available
      INTO v_menu_item
      FROM public.menu_items
     WHERE id = (v_item->>'menu_item_id')::uuid
       AND deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Menu item % not found or has been removed.', v_item->>'menu_item_id';
    END IF;

    IF v_menu_item.restaurant_id != p_restaurant_id THEN
      RAISE EXCEPTION 'Menu item % does not belong to restaurant %.', v_menu_item.id, p_restaurant_id;
    END IF;

    IF NOT v_menu_item.is_available THEN
      RAISE EXCEPTION 'Menu item "%" is currently unavailable.', v_menu_item.name;
    END IF;

    IF (v_item->>'quantity')::integer < 1 THEN
      RAISE EXCEPTION 'Quantity for item "%" must be at least 1.', v_menu_item.name;
    END IF;

    -- Accumulate total (integer centavos / cordobas — no floats)
    v_total := v_total + (v_menu_item.price_cordobas * (v_item->>'quantity')::integer);

    -- Build snapshot entry
    v_cart_snapshot := v_cart_snapshot || jsonb_build_array(
      jsonb_build_object(
        'menu_item_id', v_menu_item.id,
        'name',         v_menu_item.name,
        'quantity',     (v_item->>'quantity')::integer,
        'unit_price',   v_menu_item.price_cordobas
      )
    );
  END LOOP;

  -- 5. Insert the order row
  INSERT INTO public.orders (
    customer_id,
    restaurant_id,
    delivery_address,
    delivery_coords,
    total_amount,
    cart_snapshot,
    status
  ) VALUES (
    v_customer_id,
    p_restaurant_id,
    p_delivery_address,
    p_delivery_coords,
    v_total,
    v_cart_snapshot,
    'pending'
  )
  RETURNING id INTO v_order_id;

  -- 6. Insert order_items rows (prices locked at time of order)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT price_cordobas INTO v_menu_item
      FROM public.menu_items
     WHERE id = (v_item->>'menu_item_id')::uuid;

    INSERT INTO public.order_items (order_id, menu_item_id, quantity, unit_price)
    VALUES (
      v_order_id,
      (v_item->>'menu_item_id')::uuid,
      (v_item->>'quantity')::integer,
      v_menu_item.price_cordobas
    );
  END LOOP;

  RETURN v_order_id;

END;
$$;


ALTER FUNCTION "public"."place_order_atomic"("p_restaurant_id" "uuid", "p_delivery_address" "text", "p_delivery_coords" "jsonb", "p_items" "jsonb") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "memberships_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'staff'::"text"])))
);


ALTER TABLE "public"."memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menu_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "position" integer DEFAULT 0,
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."menu_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menu_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "price_cordobas" integer NOT NULL,
    "image_url" "text",
    "is_available" boolean DEFAULT true NOT NULL,
    "category" "text",
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."menu_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "menu_item_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "unit_price" integer NOT NULL
);


ALTER TABLE "public"."order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "customer_id" "uuid" NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "rider_id" "uuid",
    "status" "public"."order_status" DEFAULT 'pending'::"public"."order_status" NOT NULL,
    "total_amount" integer NOT NULL,
    "delivery_address" "text" NOT NULL,
    "delivery_coords" "jsonb" NOT NULL,
    "cart_snapshot" "jsonb" NOT NULL
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "role" "public"."user_role" DEFAULT 'customer'::"public"."user_role" NOT NULL,
    "full_name" "text",
    "phone" "text",
    CONSTRAINT "profiles_full_name_check" CHECK ((("full_name" IS NULL) OR ("length"(TRIM(BOTH FROM "full_name")) >= 2))),
    CONSTRAINT "profiles_phone_check" CHECK ((("phone" IS NULL) OR ("length"(TRIM(BOTH FROM "phone")) >= 8)))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "address" "text" NOT NULL,
    "image_url" "text",
    "rating" numeric(3,1),
    "delivery_time" "text",
    "categories" "text",
    "is_open" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."restaurants" OWNER TO "postgres";


ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_user_id_restaurant_id_key" UNIQUE ("user_id", "restaurant_id");



ALTER TABLE ONLY "public"."menu_categories"
    ADD CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurants"
    ADD CONSTRAINT "restaurants_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_memberships_restaurant_id" ON "public"."memberships" USING "btree" ("restaurant_id");



CREATE INDEX "idx_memberships_user_id" ON "public"."memberships" USING "btree" ("user_id");



CREATE INDEX "idx_menu_categories_restaurant" ON "public"."menu_categories" USING "btree" ("restaurant_id");



CREATE INDEX "idx_menu_items_active" ON "public"."menu_items" USING "btree" ("restaurant_id") WHERE ("deleted_at" IS NULL);



CREATE OR REPLACE TRIGGER "tr_enforce_cart_snapshot_immutability" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_cart_snapshot_immutability"();



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."menu_categories"
    ADD CONSTRAINT "menu_categories_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admins have full access to order items" ON "public"."order_items" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role")::"text" = 'admin'::"text")))));



CREATE POLICY "Admins have full access to orders" ON "public"."orders" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role")::"text" = 'admin'::"text")))));



CREATE POLICY "Anyone can view restaurants" ON "public"."restaurants" FOR SELECT USING (true);



CREATE POLICY "Customers can insert their own orders" ON "public"."orders" FOR INSERT TO "authenticated" WITH CHECK (("customer_id" = "auth"."uid"()));



CREATE POLICY "Customers can view their own order items" ON "public"."order_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "order_items"."order_id") AND ("orders"."customer_id" = "auth"."uid"())))));



CREATE POLICY "Customers can view their own orders" ON "public"."orders" FOR SELECT TO "authenticated" USING (("customer_id" = "auth"."uid"()));



CREATE POLICY "Only existing owners can delete members" ON "public"."memberships" FOR DELETE TO "authenticated" USING ("public"."is_restaurant_owner"("restaurant_id"));



CREATE POLICY "Only existing owners can insert new members" ON "public"."memberships" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_restaurant_owner"("restaurant_id"));



CREATE POLICY "Only owners can hard delete menu items" ON "public"."menu_items" FOR DELETE TO "authenticated" USING ("public"."is_restaurant_owner"("restaurant_id"));



CREATE POLICY "Only owners can insert menu items" ON "public"."menu_items" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_restaurant_owner"("restaurant_id"));



CREATE POLICY "Owners can update their restaurant profile" ON "public"."restaurants" FOR UPDATE TO "authenticated" USING ("public"."is_restaurant_owner"("id")) WITH CHECK ("public"."is_restaurant_owner"("id"));



CREATE POLICY "Public can view active menu items" ON "public"."menu_items" FOR SELECT USING (("deleted_at" IS NULL));



CREATE POLICY "Riders can update assigned orders" ON "public"."orders" FOR UPDATE TO "authenticated" USING (("rider_id" = "auth"."uid"())) WITH CHECK (("rider_id" = "auth"."uid"()));



CREATE POLICY "Riders can view ready or assigned orders" ON "public"."orders" FOR SELECT TO "authenticated" USING ((("rider_id" = "auth"."uid"()) OR ("public"."is_restaurant_member"("restaurant_id") AND (("status")::"text" = 'ready'::"text"))));



CREATE POLICY "Staff and owners can update menu items" ON "public"."menu_items" FOR UPDATE TO "authenticated" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "Staff and owners can update their restaurant orders" ON "public"."orders" FOR UPDATE TO "authenticated" USING ("public"."is_restaurant_member"("restaurant_id")) WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "Staff and owners can view their restaurant orders" ON "public"."orders" FOR SELECT TO "authenticated" USING ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "Staff can view all menu items" ON "public"."menu_items" FOR SELECT TO "authenticated" USING ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "Staff can view order items for their restaurant" ON "public"."order_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "order_items"."order_id") AND "public"."is_restaurant_member"("orders"."restaurant_id")))));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view their own memberships" ON "public"."memberships" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."memberships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."menu_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurants" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_restaurant"("p_name" "text", "p_address" "text", "p_image_url" "text", "p_categories" "text", "p_delivery_time" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_restaurant"("p_name" "text", "p_address" "text", "p_image_url" "text", "p_categories" "text", "p_delivery_time" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_restaurant"("p_name" "text", "p_address" "text", "p_image_url" "text", "p_categories" "text", "p_delivery_time" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_restaurant"("p_name" "text", "p_address" "text", "p_image_url" "text", "p_categories" "text", "p_delivery_time" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_cart_snapshot_immutability"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_cart_snapshot_immutability"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_cart_snapshot_immutability"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_restaurant_member"("target_restaurant_id" "uuid", "required_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_restaurant_member"("target_restaurant_id" "uuid", "required_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_restaurant_member"("target_restaurant_id" "uuid", "required_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_restaurant_owner"("target_restaurant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_restaurant_owner"("target_restaurant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_restaurant_owner"("target_restaurant_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."place_order_atomic"("p_restaurant_id" "uuid", "p_delivery_address" "text", "p_delivery_coords" "jsonb", "p_items" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."place_order_atomic"("p_restaurant_id" "uuid", "p_delivery_address" "text", "p_delivery_coords" "jsonb", "p_items" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."place_order_atomic"("p_restaurant_id" "uuid", "p_delivery_address" "text", "p_delivery_coords" "jsonb", "p_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."place_order_atomic"("p_restaurant_id" "uuid", "p_delivery_address" "text", "p_delivery_coords" "jsonb", "p_items" "jsonb") TO "service_role";



GRANT ALL ON TABLE "public"."memberships" TO "anon";
GRANT ALL ON TABLE "public"."memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."memberships" TO "service_role";



GRANT ALL ON TABLE "public"."menu_categories" TO "anon";
GRANT ALL ON TABLE "public"."menu_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_categories" TO "service_role";



GRANT ALL ON TABLE "public"."menu_items" TO "anon";
GRANT ALL ON TABLE "public"."menu_items" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_items" TO "service_role";



GRANT ALL ON TABLE "public"."order_items" TO "anon";
GRANT ALL ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."restaurants" TO "anon";
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."restaurants" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurants" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";








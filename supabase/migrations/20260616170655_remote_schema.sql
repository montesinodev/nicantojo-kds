drop extension if exists "pg_net";

create type "public"."order_status" as enum ('pending', 'preparing', 'ready', 'on_the_way', 'delivered', 'cancelled');

create type "public"."user_role" as enum ('customer', 'admin', 'rider');


  create table "public"."memberships" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "restaurant_id" uuid not null,
    "role" text not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."memberships" enable row level security;


  create table "public"."menu_items" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "restaurant_id" uuid not null,
    "name" text not null,
    "description" text,
    "price_cordobas" integer not null,
    "image_url" text,
    "is_available" boolean not null default true,
    "category" text,
    "deleted_at" timestamp with time zone
      );


alter table "public"."menu_items" enable row level security;


  create table "public"."order_items" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "order_id" uuid not null,
    "menu_item_id" uuid not null,
    "quantity" integer not null default 1,
    "unit_price" integer not null
      );


alter table "public"."order_items" enable row level security;


  create table "public"."orders" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone default now(),
    "customer_id" uuid not null,
    "restaurant_id" uuid not null,
    "rider_id" uuid,
    "status" public.order_status not null default 'pending'::public.order_status,
    "total_amount" integer not null,
    "delivery_address" text not null,
    "delivery_coords" jsonb not null,
    "cart_snapshot" jsonb not null
      );


alter table "public"."orders" enable row level security;


  create table "public"."profiles" (
    "id" uuid not null,
    "role" public.user_role not null default 'customer'::public.user_role,
    "full_name" text,
    "phone" text
      );


alter table "public"."profiles" enable row level security;


  create table "public"."restaurants" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "address" text not null,
    "image_url" text,
    "rating" numeric(3,1),
    "delivery_time" text,
    "categories" text,
    "is_open" boolean not null default true
      );


alter table "public"."restaurants" enable row level security;

CREATE INDEX idx_memberships_restaurant_id ON public.memberships USING btree (restaurant_id);

CREATE INDEX idx_memberships_user_id ON public.memberships USING btree (user_id);

CREATE INDEX idx_menu_items_active ON public.menu_items USING btree (restaurant_id) WHERE (deleted_at IS NULL);

CREATE UNIQUE INDEX memberships_pkey ON public.memberships USING btree (id);

CREATE UNIQUE INDEX memberships_user_id_restaurant_id_key ON public.memberships USING btree (user_id, restaurant_id);

CREATE UNIQUE INDEX menu_items_pkey ON public.menu_items USING btree (id);

CREATE UNIQUE INDEX order_items_pkey ON public.order_items USING btree (id);

CREATE UNIQUE INDEX orders_pkey ON public.orders USING btree (id);

CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);

CREATE UNIQUE INDEX restaurants_pkey ON public.restaurants USING btree (id);

alter table "public"."memberships" add constraint "memberships_pkey" PRIMARY KEY using index "memberships_pkey";

alter table "public"."menu_items" add constraint "menu_items_pkey" PRIMARY KEY using index "menu_items_pkey";

alter table "public"."order_items" add constraint "order_items_pkey" PRIMARY KEY using index "order_items_pkey";

alter table "public"."orders" add constraint "orders_pkey" PRIMARY KEY using index "orders_pkey";

alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY using index "profiles_pkey";

alter table "public"."restaurants" add constraint "restaurants_pkey" PRIMARY KEY using index "restaurants_pkey";

alter table "public"."memberships" add constraint "memberships_restaurant_id_fkey" FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE not valid;

alter table "public"."memberships" validate constraint "memberships_restaurant_id_fkey";

alter table "public"."memberships" add constraint "memberships_role_check" CHECK ((role = ANY (ARRAY['owner'::text, 'staff'::text]))) not valid;

alter table "public"."memberships" validate constraint "memberships_role_check";

alter table "public"."memberships" add constraint "memberships_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."memberships" validate constraint "memberships_user_id_fkey";

alter table "public"."memberships" add constraint "memberships_user_id_restaurant_id_key" UNIQUE using index "memberships_user_id_restaurant_id_key";

alter table "public"."menu_items" add constraint "menu_items_restaurant_id_fkey" FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE RESTRICT not valid;

alter table "public"."menu_items" validate constraint "menu_items_restaurant_id_fkey";

alter table "public"."order_items" add constraint "order_items_menu_item_id_fkey" FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) not valid;

alter table "public"."order_items" validate constraint "order_items_menu_item_id_fkey";

alter table "public"."order_items" add constraint "order_items_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE not valid;

alter table "public"."order_items" validate constraint "order_items_order_id_fkey";

alter table "public"."orders" add constraint "orders_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."orders" validate constraint "orders_customer_id_fkey";

alter table "public"."orders" add constraint "orders_restaurant_id_fkey" FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) not valid;

alter table "public"."orders" validate constraint "orders_restaurant_id_fkey";

alter table "public"."orders" add constraint "orders_rider_id_fkey" FOREIGN KEY (rider_id) REFERENCES public.profiles(id) not valid;

alter table "public"."orders" validate constraint "orders_rider_id_fkey";

alter table "public"."profiles" add constraint "profiles_full_name_check" CHECK (((full_name IS NULL) OR (length(TRIM(BOTH FROM full_name)) >= 2))) not valid;

alter table "public"."profiles" validate constraint "profiles_full_name_check";

alter table "public"."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."profiles" validate constraint "profiles_id_fkey";

alter table "public"."profiles" add constraint "profiles_phone_check" CHECK (((phone IS NULL) OR (length(TRIM(BOTH FROM phone)) >= 8))) not valid;

alter table "public"."profiles" validate constraint "profiles_phone_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.enforce_cart_snapshot_immutability()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF OLD.cart_snapshot IS DISTINCT FROM NEW.cart_snapshot THEN
        RAISE EXCEPTION 'PHASE 4 ENFORCEMENT: cart_snapshot is immutable and cannot be modified after order creation.';
    END IF;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.is_restaurant_member(target_restaurant_id uuid, required_role text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.memberships
        WHERE user_id = auth.uid()
          AND restaurant_id = target_restaurant_id
          AND (required_role IS NULL OR role = required_role)
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_restaurant_owner(target_restaurant_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    RETURN public.is_restaurant_member(target_restaurant_id, 'owner');
END;
$function$
;

grant delete on table "public"."memberships" to "anon";

grant insert on table "public"."memberships" to "anon";

grant references on table "public"."memberships" to "anon";

grant select on table "public"."memberships" to "anon";

grant trigger on table "public"."memberships" to "anon";

grant truncate on table "public"."memberships" to "anon";

grant update on table "public"."memberships" to "anon";

grant delete on table "public"."memberships" to "authenticated";

grant insert on table "public"."memberships" to "authenticated";

grant references on table "public"."memberships" to "authenticated";

grant select on table "public"."memberships" to "authenticated";

grant trigger on table "public"."memberships" to "authenticated";

grant truncate on table "public"."memberships" to "authenticated";

grant update on table "public"."memberships" to "authenticated";

grant delete on table "public"."memberships" to "service_role";

grant insert on table "public"."memberships" to "service_role";

grant references on table "public"."memberships" to "service_role";

grant select on table "public"."memberships" to "service_role";

grant trigger on table "public"."memberships" to "service_role";

grant truncate on table "public"."memberships" to "service_role";

grant update on table "public"."memberships" to "service_role";

grant delete on table "public"."menu_items" to "anon";

grant insert on table "public"."menu_items" to "anon";

grant references on table "public"."menu_items" to "anon";

grant select on table "public"."menu_items" to "anon";

grant trigger on table "public"."menu_items" to "anon";

grant truncate on table "public"."menu_items" to "anon";

grant update on table "public"."menu_items" to "anon";

grant delete on table "public"."menu_items" to "authenticated";

grant insert on table "public"."menu_items" to "authenticated";

grant references on table "public"."menu_items" to "authenticated";

grant select on table "public"."menu_items" to "authenticated";

grant trigger on table "public"."menu_items" to "authenticated";

grant truncate on table "public"."menu_items" to "authenticated";

grant update on table "public"."menu_items" to "authenticated";

grant delete on table "public"."menu_items" to "service_role";

grant insert on table "public"."menu_items" to "service_role";

grant references on table "public"."menu_items" to "service_role";

grant select on table "public"."menu_items" to "service_role";

grant trigger on table "public"."menu_items" to "service_role";

grant truncate on table "public"."menu_items" to "service_role";

grant update on table "public"."menu_items" to "service_role";

grant delete on table "public"."order_items" to "anon";

grant insert on table "public"."order_items" to "anon";

grant references on table "public"."order_items" to "anon";

grant select on table "public"."order_items" to "anon";

grant trigger on table "public"."order_items" to "anon";

grant truncate on table "public"."order_items" to "anon";

grant update on table "public"."order_items" to "anon";

grant delete on table "public"."order_items" to "authenticated";

grant insert on table "public"."order_items" to "authenticated";

grant references on table "public"."order_items" to "authenticated";

grant select on table "public"."order_items" to "authenticated";

grant trigger on table "public"."order_items" to "authenticated";

grant truncate on table "public"."order_items" to "authenticated";

grant update on table "public"."order_items" to "authenticated";

grant delete on table "public"."order_items" to "service_role";

grant insert on table "public"."order_items" to "service_role";

grant references on table "public"."order_items" to "service_role";

grant select on table "public"."order_items" to "service_role";

grant trigger on table "public"."order_items" to "service_role";

grant truncate on table "public"."order_items" to "service_role";

grant update on table "public"."order_items" to "service_role";

grant delete on table "public"."orders" to "anon";

grant insert on table "public"."orders" to "anon";

grant references on table "public"."orders" to "anon";

grant select on table "public"."orders" to "anon";

grant trigger on table "public"."orders" to "anon";

grant truncate on table "public"."orders" to "anon";

grant update on table "public"."orders" to "anon";

grant delete on table "public"."orders" to "authenticated";

grant insert on table "public"."orders" to "authenticated";

grant references on table "public"."orders" to "authenticated";

grant select on table "public"."orders" to "authenticated";

grant trigger on table "public"."orders" to "authenticated";

grant truncate on table "public"."orders" to "authenticated";

grant update on table "public"."orders" to "authenticated";

grant delete on table "public"."orders" to "service_role";

grant insert on table "public"."orders" to "service_role";

grant references on table "public"."orders" to "service_role";

grant select on table "public"."orders" to "service_role";

grant trigger on table "public"."orders" to "service_role";

grant truncate on table "public"."orders" to "service_role";

grant update on table "public"."orders" to "service_role";

grant delete on table "public"."profiles" to "anon";

grant insert on table "public"."profiles" to "anon";

grant references on table "public"."profiles" to "anon";

grant select on table "public"."profiles" to "anon";

grant trigger on table "public"."profiles" to "anon";

grant truncate on table "public"."profiles" to "anon";

grant update on table "public"."profiles" to "anon";

grant delete on table "public"."profiles" to "authenticated";

grant insert on table "public"."profiles" to "authenticated";

grant references on table "public"."profiles" to "authenticated";

grant select on table "public"."profiles" to "authenticated";

grant trigger on table "public"."profiles" to "authenticated";

grant truncate on table "public"."profiles" to "authenticated";

grant update on table "public"."profiles" to "authenticated";

grant delete on table "public"."profiles" to "service_role";

grant insert on table "public"."profiles" to "service_role";

grant references on table "public"."profiles" to "service_role";

grant select on table "public"."profiles" to "service_role";

grant trigger on table "public"."profiles" to "service_role";

grant truncate on table "public"."profiles" to "service_role";

grant update on table "public"."profiles" to "service_role";

grant delete on table "public"."restaurants" to "anon";

grant insert on table "public"."restaurants" to "anon";

grant references on table "public"."restaurants" to "anon";

grant select on table "public"."restaurants" to "anon";

grant trigger on table "public"."restaurants" to "anon";

grant truncate on table "public"."restaurants" to "anon";

grant update on table "public"."restaurants" to "anon";

grant delete on table "public"."restaurants" to "authenticated";

grant insert on table "public"."restaurants" to "authenticated";

grant references on table "public"."restaurants" to "authenticated";

grant select on table "public"."restaurants" to "authenticated";

grant trigger on table "public"."restaurants" to "authenticated";

grant truncate on table "public"."restaurants" to "authenticated";

grant update on table "public"."restaurants" to "authenticated";

grant delete on table "public"."restaurants" to "service_role";

grant insert on table "public"."restaurants" to "service_role";

grant references on table "public"."restaurants" to "service_role";

grant select on table "public"."restaurants" to "service_role";

grant trigger on table "public"."restaurants" to "service_role";

grant truncate on table "public"."restaurants" to "service_role";

grant update on table "public"."restaurants" to "service_role";


  create policy "Only existing owners can delete members"
  on "public"."memberships"
  as permissive
  for delete
  to authenticated
using (public.is_restaurant_owner(restaurant_id));



  create policy "Only existing owners can insert new members"
  on "public"."memberships"
  as permissive
  for insert
  to authenticated
with check (public.is_restaurant_owner(restaurant_id));



  create policy "Users can view their own memberships"
  on "public"."memberships"
  as permissive
  for select
  to authenticated
using ((user_id = auth.uid()));



  create policy "Only owners can hard delete menu items"
  on "public"."menu_items"
  as permissive
  for delete
  to authenticated
using (public.is_restaurant_owner(restaurant_id));



  create policy "Only owners can insert menu items"
  on "public"."menu_items"
  as permissive
  for insert
  to authenticated
with check (public.is_restaurant_owner(restaurant_id));



  create policy "Public can view active menu items"
  on "public"."menu_items"
  as permissive
  for select
  to public
using ((deleted_at IS NULL));



  create policy "Staff and owners can update menu items"
  on "public"."menu_items"
  as permissive
  for update
  to authenticated
using (public.is_restaurant_member(restaurant_id))
with check (public.is_restaurant_member(restaurant_id));



  create policy "Staff can view all menu items"
  on "public"."menu_items"
  as permissive
  for select
  to authenticated
using (public.is_restaurant_member(restaurant_id));



  create policy "Admins have full access to order items"
  on "public"."order_items"
  as permissive
  for all
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = 'admin'::text)))));



  create policy "Customers can view their own order items"
  on "public"."order_items"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.orders
  WHERE ((orders.id = order_items.order_id) AND (orders.customer_id = auth.uid())))));



  create policy "Staff can view order items for their restaurant"
  on "public"."order_items"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.orders
  WHERE ((orders.id = order_items.order_id) AND public.is_restaurant_member(orders.restaurant_id)))));



  create policy "Admins have full access to orders"
  on "public"."orders"
  as permissive
  for all
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = 'admin'::text)))));



  create policy "Customers can insert own orders"
  on "public"."orders"
  as permissive
  for insert
  to public
with check ((auth.uid() = customer_id));



  create policy "Customers can insert their own orders"
  on "public"."orders"
  as permissive
  for insert
  to authenticated
with check ((customer_id = auth.uid()));



  create policy "Customers can view own orders"
  on "public"."orders"
  as permissive
  for select
  to public
using ((auth.uid() = customer_id));



  create policy "Customers can view their own orders"
  on "public"."orders"
  as permissive
  for select
  to authenticated
using ((customer_id = auth.uid()));



  create policy "Riders can update assigned orders"
  on "public"."orders"
  as permissive
  for update
  to authenticated
using ((rider_id = auth.uid()))
with check ((rider_id = auth.uid()));



  create policy "Riders can update own orders"
  on "public"."orders"
  as permissive
  for update
  to public
using ((rider_id = auth.uid()));



  create policy "Riders can view ready or assigned orders"
  on "public"."orders"
  as permissive
  for select
  to authenticated
using (((rider_id = auth.uid()) OR (public.is_restaurant_member(restaurant_id) AND ((status)::text = 'ready'::text))));



  create policy "Staff and owners can update their restaurant orders"
  on "public"."orders"
  as permissive
  for update
  to authenticated
using (public.is_restaurant_member(restaurant_id))
with check (public.is_restaurant_member(restaurant_id));



  create policy "Staff and owners can view their restaurant orders"
  on "public"."orders"
  as permissive
  for select
  to authenticated
using (public.is_restaurant_member(restaurant_id));



  create policy "Allow KDS to read profiles"
  on "public"."profiles"
  as permissive
  for select
  to public
using (true);



  create policy "Users can update own profile"
  on "public"."profiles"
  as permissive
  for update
  to public
using ((auth.uid() = id));



  create policy "Users can view own profile"
  on "public"."profiles"
  as permissive
  for select
  to public
using ((auth.uid() = id));



  create policy "Anyone can view restaurants"
  on "public"."restaurants"
  as permissive
  for select
  to public
using (true);



  create policy "Owners can update their restaurant profile"
  on "public"."restaurants"
  as permissive
  for update
  to authenticated
using (public.is_restaurant_owner(id))
with check (public.is_restaurant_owner(id));


CREATE TRIGGER tr_enforce_cart_snapshot_immutability BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.enforce_cart_snapshot_immutability();

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();



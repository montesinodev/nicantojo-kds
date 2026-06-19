-- =============================================================
-- PHASE 6: place_order_atomic + RLS cleanup
-- =============================================================

-- -------------------------------------------------------------
-- SECTION 1: Drop duplicate / overly-permissive RLS policies
-- -------------------------------------------------------------

-- Orders: drop the 'public' role duplicates (authenticated versions stay)
DROP POLICY IF EXISTS "Customers can insert own orders"    ON public.orders;
DROP POLICY IF EXISTS "Customers can view own orders"      ON public.orders;
DROP POLICY IF EXISTS "Riders can update own orders"       ON public.orders;

-- Profiles: drop the catch-all public read (will be replaced in Phase 7 with KDS auth)
DROP POLICY IF EXISTS "Allow KDS to read profiles"         ON public.profiles;

-- -------------------------------------------------------------
-- SECTION 2: Tighten profiles SELECT
-- Users can only read their own profile now.
-- KDS will authenticate as a staff member and will be covered
-- by the membership-based policy added in Phase 7.
-- -------------------------------------------------------------

-- "Users can view own profile" already exists and is correct — no change needed.
-- Just confirming the catch-all is gone (dropped above).


-- -------------------------------------------------------------
-- SECTION 3: place_order_atomic SQL function
-- SECURITY DEFINER — runs as the function owner, bypasses RLS.
-- All business logic is enforced inside the function itself.
-- -------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.place_order_atomic(
  p_restaurant_id    uuid,
  p_delivery_address text,
  p_delivery_coords  jsonb,
  p_items            jsonb   -- [{menu_item_id: uuid, quantity: int}, ...]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

-- Grant execute to authenticated users only
REVOKE ALL ON FUNCTION public.place_order_atomic FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_order_atomic TO authenticated;
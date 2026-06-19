-- =============================================================
-- PHASE 8: create_restaurant atomic function + restaurant INSERT lock
-- =============================================================

-- -------------------------------------------------------------
-- SECTION 1: Lock direct INSERT on restaurants
-- No one should be able to create a restaurant row directly.
-- All creation must go through create_restaurant() below.
-- (There is no INSERT policy on restaurants — this confirms it
-- stays that way. The SECURITY DEFINER function is the only path.)
-- -------------------------------------------------------------

-- Explicitly revoke INSERT on restaurants from authenticated users
-- so it can never be done directly from the client.
REVOKE INSERT ON public.restaurants FROM authenticated;
REVOKE INSERT ON public.restaurants FROM anon;


-- -------------------------------------------------------------
-- SECTION 2: create_restaurant()
-- Atomically:
--   1. Creates the restaurant row
--   2. Inserts the caller as 'owner' in memberships
-- If either step fails, both roll back.
-- -------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_restaurant(
  p_name          text,
  p_address       text,
  p_image_url     text    DEFAULT NULL,
  p_categories    text    DEFAULT NULL,
  p_delivery_time text    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

-- Grant execute to authenticated users only
REVOKE ALL ON FUNCTION public.create_restaurant FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_restaurant TO authenticated;


-- -------------------------------------------------------------
-- SECTION 3: Verify menu item policies are correct
-- These were added in Phase 5 and should already be live.
-- This section is documentation only — no SQL changes.
--
-- ✅ "Only owners can insert menu items"
--      INSERT to authenticated WHERE is_restaurant_owner(restaurant_id)
-- ✅ "Staff and owners can update menu items"
--      UPDATE to authenticated WHERE is_restaurant_member(restaurant_id)
-- ✅ "Only owners can hard delete menu items"
--      DELETE to authenticated WHERE is_restaurant_owner(restaurant_id)
-- ✅ "Public can view active menu items"
--      SELECT to public WHERE deleted_at IS NULL
--
-- Soft delete (set deleted_at = now()) is handled via the UPDATE
-- policy above. Hard delete is owner-only.
-- -------------------------------------------------------------
-- STEP 1: Add category_id column to menu_items
ALTER TABLE public.menu_items
ADD COLUMN category_id uuid;

-- STEP 2: Link to menu_categories
ALTER TABLE public.menu_items
ADD CONSTRAINT menu_items_category_id_fkey
FOREIGN KEY (category_id)
REFERENCES public.menu_categories(id)
ON DELETE SET NULL;

-- STEP 3: Backfill existing text categories into real categories
INSERT INTO public.menu_categories (restaurant_id, name, position)
SELECT DISTINCT
  restaurant_id,
  category,
  0
FROM public.menu_items
WHERE category IS NOT NULL
  AND category <> '';

-- STEP 4: Assign category_id based on name match
UPDATE public.menu_items mi
SET category_id = mc.id
FROM public.menu_categories mc
WHERE mi.restaurant_id = mc.restaurant_id
  AND mi.category = mc.name;

-- STEP 5: Optional cleanup (we keep text for now for safety)
-- DO NOT DROP YET (we’ll remove after frontend is stable)

-- STEP 6: Index for performance
CREATE INDEX IF NOT EXISTS idx_menu_items_category_id
ON public.menu_items(category_id);
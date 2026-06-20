import { supabase } from '@/lib/supabase';
import type { MenuItem } from './types';

export async function fetchMenuItems(restaurantId: string): Promise<MenuItem[]> {
  const { data, error } = await supabase
    .from('menu_items')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);

  return (data || []) as MenuItem[];
}

export async function createMenuItem(payload: {
  restaurant_id: string;
  name: string;
  description?: string | null;
  price_cordobas: number;
  category?: string | null;
  image_url?: string | null;
  is_available: boolean;
}) {
  const { error } = await supabase
    .from('menu_items')
    .insert([payload]);

  if (error) throw new Error(error.message);
}

export async function updateMenuItem(id: string, payload: Partial<any>) {
  const { error } = await supabase
    .from('menu_items')
    .update(payload)
    .eq('id', id);

  if (error) throw new Error(error.message);
}

export async function toggleAvailability(id: string, current: boolean) {
  const { error } = await supabase
    .from('menu_items')
    .update({ is_available: !current })
    .eq('id', id);

  if (error) throw new Error(error.message);
}

export async function softDeleteMenuItem(id: string) {
  const { error } = await supabase
    .from('menu_items')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(error.message);
}
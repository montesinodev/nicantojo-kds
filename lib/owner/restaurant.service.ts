import { supabase } from '@/lib/supabase';
import type { Restaurant } from './types';

export async function fetchOwnerRestaurants(userId: string): Promise<Restaurant[]> {
  const { data, error } = await supabase
    .from('memberships')
    .select('restaurant:restaurants(id, name, address, is_open, categories)')
    .eq('user_id', userId)
    .eq('role', 'owner');

  if (error) throw new Error(error.message);

  return ((data || [])
    .map((m: any) => m.restaurant)
    .filter(Boolean)) as Restaurant[];
}

export async function createRestaurant(params: {
  name: string;
  address: string;
  categories?: string | null;
  delivery_time?: string | null;
  image_url?: string | null;
}) {
  const { data, error } = await supabase.rpc('create_restaurant', {
    p_name: params.name,
    p_address: params.address,
    p_categories: params.categories || null,
    p_delivery_time: params.delivery_time || null,
    p_image_url: params.image_url || null,
  });

  if (error) throw new Error(error.message);

  return data; // restaurant_id
}

export async function toggleRestaurantOpen(id: string, current: boolean) {
  const { error } = await supabase
    .from('restaurants')
    .update({ is_open: !current })
    .eq('id', id);

  if (error) throw new Error(error.message);
}
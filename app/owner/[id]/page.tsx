'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price_cordobas: number;
  category: string | null;
  image_url: string | null;
  is_available: boolean;
  deleted_at: string | null;
}

interface Restaurant {
  id: string;
  name: string;
  is_open: boolean;
}

export default function RestaurantMenuPage() {
  const params = useParams();
  const id = params?.id as string;

  const router = useRouter();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;

      if (!session) {
        router.push('/owner');
        return;
      }

      const userId = session.user.id;

      const { data: membership } = await supabase
        .from('memberships')
        .select('id')
        .eq('user_id', userId)
        .eq('restaurant_id', id)
        .eq('role', 'owner')
        .maybeSingle();

      if (!membership) {
        router.push('/owner');
        return;
      }

      setAuthorized(true);

      await Promise.all([fetchRestaurant(), fetchItems()]);
      setLoading(false);
    }

    if (id) init();
  }, [id]);

  async function fetchRestaurant() {
    const { data } = await supabase
      .from('restaurants')
      .select('id, name, is_open')
      .eq('id', id)
      .single();

    if (data) setRestaurant(data);
  }

  async function fetchItems() {
    const { data } = await supabase
      .from('menu_items')
      .select('*')
      .eq('restaurant_id', id)
      .order('category', { ascending: true })
      .order('name', { ascending: true });

    setItems(data || []);
  }

  const groupedItems = useMemo(() => {
    const map: Record<string, MenuItem[]> = {};

    for (const item of items) {
      if (item.deleted_at) continue;

      const category = item.category?.trim() || 'Sin categoría';

      if (!map[category]) {
        map[category] = [];
      }

      map[category].push(item);
    }

    return map;
  }, [items]);

  async function toggleAvailability(item: MenuItem) {
    await supabase
      .from('menu_items')
      .update({ is_available: !item.is_available })
      .eq('id', item.id);

    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? { ...i, is_available: !i.is_available }
          : i
      )
    );
  }

  async function toggleRestaurantOpen() {
    if (!restaurant) return;

    await supabase
      .from('restaurants')
      .update({ is_open: !restaurant.is_open })
      .eq('id', id);

    setRestaurant({
      ...restaurant,
      is_open: !restaurant.is_open,
    });
  }

  async function softDeleteItem(item: MenuItem) {
    const ok = confirm(`Delete ${item.name}?`);
    if (!ok) return;

    await supabase
      .from('menu_items')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', item.id);

    setItems((prev) => prev.filter((i) => i.id !== item.id));
  }

  if (loading || !authorized) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-400">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <header className="flex justify-between mb-6">
        <button
          onClick={() => router.push('/owner')}
          className="text-slate-400"
        >
          ← Back
        </button>

        <Button onClick={toggleRestaurantOpen}>
          {restaurant?.is_open ? 'Open' : 'Closed'}
        </Button>
      </header>

      <h1 className="text-xl font-bold mb-6">
        {restaurant?.name}
      </h1>

      {/* GROUPED MENU */}
      <div className="space-y-8">
        {Object.entries(groupedItems).map(([category, items]) => (
          <div key={category}>
            <h2 className="text-lg font-bold text-slate-300 mb-3">
              {category}
            </h2>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <Card key={item.id} className="bg-slate-900">
                  <CardHeader>
                    <CardTitle className="text-base">
                      {item.name}
                    </CardTitle>
                    <p className="text-sm text-slate-400">
                      C$ {item.price_cordobas}
                    </p>
                  </CardHeader>

                  <CardContent className="flex gap-2">
                    <Button
                      onClick={() => toggleAvailability(item)}
                      size="sm"
                    >
                      {item.is_available ? 'On' : 'Off'}
                    </Button>

                    <Button
                      onClick={() => softDeleteItem(item)}
                      size="sm"
                      variant="outline"
                    >
                      Delete
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
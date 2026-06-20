'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface KdsOrder {
  id: string;
  created_at: string;
  status: 'pending' | 'preparing' | 'ready' | string;
  total_amount: number;
  cart_snapshot: any;
  restaurant_id: string;
}

export function useKdsOrders(restaurantId: string) {
  const [orders, setOrders] = useState<KdsOrder[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchOrders() {
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .in('status', ['pending', 'preparing', 'ready'])
      .order('created_at', { ascending: false });

    setOrders(data || []);
    setLoading(false);
  }

  useEffect(() => {
    if (!restaurantId) return;

    fetchOrders();

    const channel = supabase
      .channel(`kds-orders-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => {
          fetchOrders(); // simple + safe sync strategy
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId]);

  return { orders, loading, refresh: fetchOrders };
}
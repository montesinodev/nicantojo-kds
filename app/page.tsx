'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type OrderStatus = 'pending' | 'preparing' | 'ready' | 'on_the_way' | 'delivered' | 'cancelled';

interface Order {
  id: string;
  status: OrderStatus;
  total_amount: number;
  order_items: { name: string; quantity: number }[];
  restaurant: { name: string };
}

export default function KDSPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    async function fetchOrders() {
      const { data, error } = await supabase
        .from('orders')
        .select('*, restaurant:restaurants(name)')
        .in('status', ['pending', 'preparing', 'ready']);
      if (data) setOrders(data as Order[]);
    }
    fetchOrders();

    const channel = supabase
      .channel('kds-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload: any) => {
        if (payload.eventType === 'INSERT') setOrders((prev) => [...prev, payload.new as Order]);
        if (payload.eventType === 'UPDATE') {
          setOrders((prev) => 
            ['on_the_way', 'delivered', 'cancelled'].includes(payload.new.status)
              ? prev.filter((o) => o.id !== payload.new.id)
              : prev.map((o) => o.id === payload.new.id ? { ...o, ...payload.new } : o)
          );
        }
      })
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => { supabase.removeChannel(channel); };
  }, []);

  const updateStatus = async (id: string, status: OrderStatus) => {
    await supabase.from('orders').update({ status }).eq('id', id);
  };

  return (
    <main className="p-8 bg-slate-950 min-h-screen text-white">
      <header className="mb-8 flex items-center justify-between border-b border-slate-800 pb-6">
        <div className="flex items-center gap-6">
          <h1 className="text-3xl font-black tracking-tight text-red-500">
            NicAntojo <span className="text-white">KDS</span>
          </h1>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold border ${
            isConnected ? 'bg-green-950 border-green-700 text-green-400' : 'bg-red-950 border-red-700 text-red-400'
          }`}>
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
            {isConnected ? 'LIVE' : 'OFFLINE'}
          </div>
        </div>
        <div className="text-sm font-mono text-slate-400">Active Tickets: {orders.length}</div>
      </header>

      <div className="grid grid-cols-3 gap-6">
        {['pending', 'preparing', 'ready'].map((status) => (
          <div key={status} className="space-y-4">
            <h2 className="text-xl font-semibold capitalize text-slate-400 mb-4">
                {status === 'pending' ? 'Nuevos' : status === 'preparing' ? 'En Cocina' : 'Listos'}
            </h2>
            {orders.filter((o) => o.status === status).map((order) => (
              <Card key={order.id} className="bg-slate-900 border-slate-800 text-white">
                <CardHeader>
                  <CardTitle className="text-sm font-mono text-slate-400">ID: {order.id.slice(0, 8)}</CardTitle>
                </CardHeader>
                <CardContent>
                  {order.order_items.map((item, i) => (
                    <div key={i} className="text-sm font-medium">{item.quantity}x {item.name}</div>
                  ))}
                  <div className="mt-4 flex gap-2">
                    {status === 'pending' && (
                      <Button onClick={() => updateStatus(order.id, 'preparing')} size="sm" className="bg-orange-600 hover:bg-orange-700">
                        Preparar
                      </Button>
                    )}
                    {status === 'preparing' && (
                      <Button onClick={() => updateStatus(order.id, 'ready')} size="sm" className="bg-yellow-600 hover:bg-yellow-700">
                        Terminar
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ))}
      </div>
    </main>
  );
}
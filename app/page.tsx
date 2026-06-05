'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type OrderStatus = 'pending' | 'preparing' | 'ready' | 'on_the_way' | 'delivered' | 'cancelled';

interface Order {
  id: string;
  created_at: string;
  status: OrderStatus;
  total_amount: number;
  order_items: { name: string; quantity: number }[];
  restaurant: { name: string };
  customer?: { full_name: string };
}

interface RealtimePayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Order;
  old?: { id: string };
}

const TicketTimer = ({ createdAt }: { createdAt: string }) => {
  const [minutes, setMinutes] = useState(0);

  useEffect(() => {
    const calculateMinutes = () => {
      const elapsed = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
      setMinutes(elapsed > 0 ? elapsed : 0);
    };
    
    calculateMinutes();
    const interval = setInterval(calculateMinutes, 60000);
    return () => clearInterval(interval);
  }, [createdAt]);

  const isLate = minutes > 15;
  return (
    <div className={`text-xs font-bold px-2 py-1 rounded-md ${isLate ? 'bg-red-950 text-red-400 animate-pulse' : 'bg-slate-800 text-slate-300'}`}>
      ⏱ {minutes} min
    </div>
  );
};

export default function KDSPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [currentTime, setCurrentTime] = useState<number>(0);

  // Maintain purity and avoid cascading renders by making the initial set async
  useEffect(() => {
    let isMounted = true;

    const timer = setTimeout(() => {
      if (isMounted) setCurrentTime(Date.now());
    }, 0);

    const interval = setInterval(() => {
      if (isMounted) setCurrentTime(Date.now());
    }, 60000);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  const playAlert = useCallback(() => {
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioContextClass();
      
      const playTone = (freq: number, startTime: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.5, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);
        osc.start(startTime);
        osc.stop(startTime + 0.5);
      };

      playTone(880, ctx.currentTime);
      playTone(1046.50, ctx.currentTime + 0.15);
    } catch {
      console.warn('Audio playback blocked by browser policy. Click anywhere on the page to enable.');
    }
  }, []);

  useEffect(() => {
    async function fetchOrders() {
      const { data, error } = await supabase
        .from('orders')
        .select('*, restaurant:restaurants(name), customer:profiles!customer_id(full_name)')
        .in('status', ['pending', 'preparing', 'ready', 'cancelled']);
        
      if (error) {
        console.error('Failed to fetch initial orders:', error.message);
        return;
      }
      if (data) setOrders(data as Order[]);
    }
    
    fetchOrders();

    const channel = supabase
      .channel('kds-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload: unknown) => {
        const typedPayload = payload as RealtimePayload;
        
        if (typedPayload.eventType === 'INSERT') {
          // The realtime payload lacks joined data. We must fetch the full profile specifically for this new order.
          const hydrateAndSetOrder = async () => {
            const { data } = await supabase
              .from('orders')
              .select('*, restaurant:restaurants(name), customer:profiles!customer_id(full_name)')
              .eq('id', typedPayload.new.id)
              .single();

            if (data) {
              setOrders((prev) => [...prev, data as Order]);
              playAlert(); // Trigger sound only after data is ready
            }
          };
          
          hydrateAndSetOrder();
        }
        if (typedPayload.eventType === 'UPDATE') {
          setOrders((prev) => 
            ['on_the_way', 'delivered'].includes(typedPayload.new.status)
              ? prev.filter((o) => o.id !== typedPayload.new.id)
              : prev.map((o) => o.id === typedPayload.new.id ? { ...o, ...typedPayload.new } : o)
          );
        }
      })
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => { supabase.removeChannel(channel); };
  }, [playAlert]);

  const updateStatus = async (id: string, status: OrderStatus) => {
    const { error } = await supabase.from('orders').update({ status }).eq('id', id);
    if (error) console.error('Failed to update order status:', error.message);
  };

  const getFriendlyId = (uuid: string) => parseInt(uuid.split('-')[0], 16) % 10000;

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit' });
  };

  const activeOrders = orders.filter((o) => {
    if (o.status === 'cancelled') {
      if (currentTime === 0) return true; 
      const minsElapsed = (currentTime - new Date(o.created_at).getTime()) / 60000;
      return minsElapsed <= 30;
    }
    return true;
  });

  const columns: { id: OrderStatus; title: string; borderColor: string }[] = [
    { id: 'pending', title: 'Nuevos', borderColor: '#E63946' },
    { id: 'preparing', title: 'En Cocina', borderColor: '#F4A261' },
    { id: 'ready', title: 'Listos', borderColor: '#06D6A0' },
    { id: 'cancelled', title: 'Cancelados', borderColor: '#6B7280' },
  ];

  return (
    <main className="p-8 bg-slate-950 min-h-screen text-white overflow-x-hidden">
      <header className="mb-8 flex items-center justify-between border-b border-slate-800 pb-6">
        <div className="flex items-center gap-6">
          <h1 className="text-3xl font-black tracking-tight text-[#E63946]">
            NicAntojo <span className="text-white">KDS</span>
          </h1>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold border ${
            isConnected ? 'bg-green-950 border-green-700 text-green-400' : 'bg-red-950 border-red-700 text-red-400'
          }`}>
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
            {isConnected ? 'LIVE' : 'OFFLINE'}
          </div>
        </div>
        <div className="text-sm font-mono text-slate-400">Total Tickets: {activeOrders.length}</div>
      </header>

      <div className="grid grid-cols-4 gap-6">
        {columns.map((col) => {
          const colOrders = activeOrders.filter((o) => o.status === col.id);
          const isCancelled = col.id === 'cancelled';

          return (
            <div key={col.id} className={`space-y-4 ${isCancelled ? 'opacity-70' : ''}`}>
              <h2 className="text-xl font-semibold text-slate-300 mb-4 flex items-center justify-between">
                {col.title}
                <span className="bg-slate-800 text-sm py-0.5 px-2 rounded-md border border-slate-700">
                  {colOrders.length}
                </span>
              </h2>

              {colOrders.map((order) => (
                <Card 
                  key={order.id} 
                  className="bg-slate-900 border-y border-r border-slate-800 text-white shadow-md relative overflow-hidden"
                  style={{ borderLeft: `4px solid ${col.borderColor}` }}
                >
                  <CardHeader className="pb-2 flex flex-row items-start justify-between">
                    <div>
                      <CardTitle className="text-lg font-black tracking-tight">
                        Pedido #{getFriendlyId(order.id)}
                      </CardTitle>
                      <div className="text-xs text-slate-400 mt-1 font-medium">
                        {order.customer?.full_name || 'Cliente'} • {formatTime(order.created_at)}
                      </div>
                    </div>
                    {!isCancelled && <TicketTimer createdAt={order.created_at} />}
                  </CardHeader>

                  <CardContent>
                    <div className="space-y-1.5 mb-4">
                      {order.order_items.map((item, i) => (
                        <div key={i} className={`text-sm font-medium ${isCancelled ? 'line-through text-slate-500' : 'text-slate-200'}`}>
                          <span className={isCancelled ? '' : 'text-white font-bold'}>{item.quantity}x</span> {item.name}
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2 border-t border-slate-800 pt-3">
                      {col.id === 'pending' && (
                        <Button onClick={() => updateStatus(order.id, 'preparing')} size="sm" className="w-full bg-[#E63946] hover:bg-red-700 text-white font-bold">
                          Preparar
                        </Button>
                      )}
                      {col.id === 'preparing' && (
                        <Button onClick={() => updateStatus(order.id, 'ready')} size="sm" className="w-full bg-[#F4A261] hover:bg-orange-500 text-slate-950 font-black">
                          Terminar
                        </Button>
                      )}
                      {col.id === 'ready' && (
                        <Button onClick={() => updateStatus(order.id, 'delivered')} size="sm" className="w-full bg-[#06D6A0] hover:bg-emerald-500 text-slate-950 font-black">
                          Completado ✓
                        </Button>
                      )}
                      {isCancelled && (
                        <div className="w-full text-center text-xs font-bold text-slate-500 uppercase tracking-widest pt-1">
                          Auto-limpieza en 30m
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          );
        })}
      </div>
    </main>
  );
}
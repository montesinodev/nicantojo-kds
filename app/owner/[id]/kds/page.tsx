'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type OrderStatus = 'pending' | 'preparing' | 'ready' | 'on_the_way' | 'delivered' | 'cancelled';

interface SnapshotItem {
  name: string;
  quantity: number;
  unit_price: number;
}

interface Order {
  id: string;
  created_at: string;
  status: OrderStatus;
  delivery_address: string;
  total_amount: number;
  cart_snapshot: SnapshotItem[];
}

interface Restaurant {
  id: string;
  name: string;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pendiente',
  preparing: 'Preparando',
  ready: 'Listo',
  on_the_way: 'En camino',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: 'bg-yellow-900/40 border-yellow-700 text-yellow-400',
  preparing: 'bg-blue-900/40 border-blue-700 text-blue-400',
  ready: 'bg-green-900/40 border-green-700 text-green-400',
  on_the_way: 'bg-purple-900/40 border-purple-700 text-purple-400',
  delivered: 'bg-slate-800 border-slate-700 text-slate-500',
  cancelled: 'bg-slate-800 border-slate-700 text-slate-500',
};

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: 'preparing',
  preparing: 'ready',
  ready: 'on_the_way',
};

const NEXT_STATUS_LABEL: Partial<Record<OrderStatus, string>> = {
  pending: 'Iniciar preparación',
  preparing: 'Marcar como listo',
  ready: 'Entregar a repartidor',
};

const ACTIVE_STATUSES: OrderStatus[] = ['pending', 'preparing', 'ready'];

export default function OwnerKdsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [notOwner, setNotOwner] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // ── Auth + restaurant check ────────────────────────────────
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/owner'); return; }

      // Verify they're an owner of this specific restaurant
      const { data: membership } = await supabase
        .from('memberships')
        .select('role, restaurants(id, name)')
        .eq('user_id', user.id)
        .eq('restaurant_id', id)
        .eq('role', 'owner')
        .maybeSingle();

      if (!membership) {
        setNotOwner(true);
        setLoading(false);
        return;
      }

      setRestaurant(membership.restaurants as unknown as Restaurant);
      setLoading(false);
    }

    init();
  }, [id, router]);

  // ── Orders ─────────────────────────────────────────────────
  const loadOrders = useCallback(async () => {
    if (!id) return;
    setOrdersLoading(true);

    const { data } = await supabase
      .from('orders')
      .select('id, created_at, status, delivery_address, total_amount, cart_snapshot')
      .eq('restaurant_id', id)
      .in('status', ACTIVE_STATUSES)
      .order('created_at', { ascending: true });

    setOrders(data || []);
    setOrdersLoading(false);
  }, [id]);

  useEffect(() => {
    if (!restaurant) return;

    loadOrders();

    const channel = supabase
      .channel(`owner-kds-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${id}`,
        },
        () => {
          loadOrders();
          try { new Audio('/sounds/ding.mp3').play(); } catch (_) {}
        }
      )
      .subscribe((status) => setIsLive(status === 'SUBSCRIBED'));

    return () => { supabase.removeChannel(channel); };
  }, [restaurant, id, loadOrders]);

  async function advanceStatus(order: Order) {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    setUpdatingId(order.id);
    await supabase.from('orders').update({ status: next }).eq('id', order.id);
    setUpdatingId(null);
    loadOrders();
  }

  // ── Loading ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-500 text-sm animate-pulse">Conectando KDS...</p>
      </div>
    );
  }

  // ── Not owner ──────────────────────────────────────────────
  if (notOwner) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-4">⚠️</div>
          <p className="text-white font-medium mb-2">Sin acceso</p>
          <p className="text-slate-500 text-sm mb-6">
            No tienes permiso para ver el KDS de este restaurante.
          </p>
          <Button
            onClick={() => router.push('/owner')}
            variant="ghost"
            className="text-slate-400 hover:text-white"
          >
            Volver al panel
          </Button>
        </div>
      </div>
    );
  }

  // ── KDS board ──────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/owner/${id}`)}
            className="text-slate-500 hover:text-white text-sm mr-1 transition-colors"
          >
            ← Panel
          </button>
          <span className="text-slate-700">|</span>
          <span className="text-lg">🖥️</span>
          <div>
            <h1 className="text-white font-semibold text-sm leading-none">{restaurant?.name}</h1>
            <p className="text-slate-500 text-xs mt-0.5">KDS · Vista del propietario</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}
          />
          <span className="text-xs text-slate-500">{isLive ? 'EN VIVO' : 'DESCONECTADO'}</span>
        </div>
      </div>

      {/* Board */}
      <div className="p-6">
        {ordersLoading ? (
          <div className="text-center py-20 text-slate-600 text-sm animate-pulse">
            Cargando pedidos...
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">✅</div>
            <p className="text-slate-400 font-medium">Sin pedidos activos</p>
            <p className="text-slate-600 text-sm mt-1">
              Los nuevos pedidos aparecerán aquí automáticamente
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {orders.map((order) => {
              const age = Math.floor(
                (Date.now() - new Date(order.created_at).getTime()) / 60000
              );
              const isUrgent = age >= 15 && order.status === 'pending';

              return (
                <Card
                  key={order.id}
                  className={`bg-slate-900 border flex flex-col ${
                    isUrgent ? 'border-red-600' : 'border-slate-800'
                  }`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-slate-500 text-xs font-mono">
                          #{order.id.slice(-6).toUpperCase()}
                        </p>
                        <p className={`text-xs mt-0.5 font-medium ${isUrgent ? 'text-red-400' : 'text-slate-500'}`}>
                          {age === 0 ? 'Ahora mismo' : `Hace ${age} min`}
                          {isUrgent && ' ⚠️'}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-semibold px-2 py-1 rounded-full border ${STATUS_COLORS[order.status]}`}
                      >
                        {STATUS_LABELS[order.status]}
                      </span>
                    </div>
                  </CardHeader>

                  <CardContent className="flex-1 flex flex-col gap-3 pb-4">
                    <div className="space-y-1.5">
                      {order.cart_snapshot?.map((item, i) => (
                        <div key={i} className="flex items-baseline justify-between gap-2">
                          <span className="text-white text-sm leading-snug">{item.name}</span>
                          <span className="text-slate-400 text-sm font-semibold flex-shrink-0">
                            ×{item.quantity}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="pt-2 border-t border-slate-800 mt-auto">
                      <p className="text-slate-500 text-xs truncate">{order.delivery_address}</p>
                      <p className="text-slate-400 text-xs mt-0.5">
                        Total: <span className="text-white font-semibold">C${order.total_amount.toLocaleString()}</span>
                      </p>
                    </div>

                    {NEXT_STATUS[order.status] && (
                      <Button
                        onClick={() => advanceStatus(order)}
                        disabled={updatingId === order.id}
                        className={`w-full mt-2 font-semibold text-sm py-2 ${
                          order.status === 'pending'
                            ? 'bg-yellow-600 hover:bg-yellow-500 text-white'
                            : order.status === 'preparing'
                            ? 'bg-blue-600 hover:bg-blue-500 text-white'
                            : 'bg-green-700 hover:bg-green-600 text-white'
                        }`}
                      >
                        {updatingId === order.id ? 'Actualizando...' : NEXT_STATUS_LABEL[order.status]}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
'use client';

import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { useKdsOrders } from '../../hooks/useKdsOrders';

export default function KdsPage() {
  const { id } = useParams<{ id: string }>();
  const { orders, loading } = useKdsOrders(id);

  async function updateStatus(orderId: string, status: string) {
    await supabase
      .from('orders')
      .update({ status })
      .eq('id', orderId);
  }

  const pending = orders.filter(o => o.status === 'pending');
  const preparing = orders.filter(o => o.status === 'preparing');
  const ready = orders.filter(o => o.status === 'ready');

  if (loading) {
    return (
      <div className="p-8 text-slate-400">Loading KDS...</div>
    );
  }

  const Column = ({ title, items, action }: any) => (
    <div className="flex-1 bg-slate-900 p-4 rounded-xl border border-slate-800">
      <h2 className="text-white font-bold mb-4">{title}</h2>

      <div className="space-y-3">
        {items.map((o: any) => (
          <div key={o.id} className="bg-slate-800 p-3 rounded-lg">
            <p className="text-xs text-slate-400">
              #{o.id.slice(0, 6)}
            </p>

            <p className="text-sm text-white">
              C$ {o.total_amount}
            </p>

            <div className="mt-2 space-y-1 text-xs text-slate-300">
              {o.cart_snapshot?.map((item: any, idx: number) => (
                <div key={idx}>
                  {item.quantity}x {item.name}
                </div>
              ))}
            </div>

            {action && (
              <Button
                className="mt-3 w-full text-xs bg-slate-700 hover:bg-slate-600"
                onClick={() => action(o.id)}
              >
                {title === 'Pending' && 'Start preparing'}
                {title === 'Preparing' && 'Mark ready'}
                {title === 'Ready' && 'Completed'}
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <h1 className="text-white text-2xl font-bold mb-6">
        Kitchen Display System
      </h1>

      <div className="flex gap-4">
        <Column
          title="Pending"
          items={pending}
          action={(id: string) => updateStatus(id, 'preparing')}
        />

        <Column
          title="Preparing"
          items={preparing}
          action={(id: string) => updateStatus(id, 'ready')}
        />

        <Column
          title="Ready"
          items={ready}
          action={null}
        />
      </div>
    </div>
  );
}
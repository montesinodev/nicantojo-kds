'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Restaurant {
  id: string;
  name: string;
  address: string;
  is_open: boolean;
  categories: string | null;
}

export default function OwnerPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [user, setUser] = useState<any>(null);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [pageLoading, setPageLoading] = useState(true);

  // Create restaurant form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [form, setForm] = useState({
    name: '',
    address: '',
    categories: '',
    delivery_time: '',
    image_url: '',
  });

  useEffect(() => {
    async function checkSession() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        await fetchRestaurants(session.user.id);
      }
      setPageLoading(false);
    }
    checkSession();
  }, []);

  async function fetchRestaurants(userId: string) {
    const { data, error } = await supabase
      .from('memberships')
      .select('restaurant:restaurants(id, name, address, is_open, categories)')
      .eq('user_id', userId)
      .eq('role', 'owner');

    if (error) {
      console.error('Failed to fetch restaurants:', error.message);
      return;
    }

    const list = (data || [])
      .map((m: any) => m.restaurant)
      .filter(Boolean) as Restaurant[];

    setRestaurants(list);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setAuthError(error.message);
      setAuthLoading(false);
      return;
    }

    setUser(data.user);
    await fetchRestaurants(data.user.id);
    setAuthLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
    setRestaurants([]);
  }

  async function handleCreateRestaurant(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError('');

    const { data, error } = await supabase.rpc('create_restaurant', {
      p_name: form.name,
      p_address: form.address,
      p_categories: form.categories || null,
      p_delivery_time: form.delivery_time || null,
      p_image_url: form.image_url || null,
    });

    if (error) {
      setCreateError(error.message);
      setCreating(false);
      return;
    }

    // Refresh restaurants list and navigate to the new one
    await fetchRestaurants(user.id);
    setShowCreateForm(false);
    setForm({ name: '', address: '', categories: '', delivery_time: '', image_url: '' });
    setCreating(false);
    router.push(`/owner/${data}`);
  }

  if (pageLoading) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400 animate-pulse">Cargando...</div>
      </main>
    );
  }

  // LOGIN SCREEN
  if (!user) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <Card className="w-full max-w-md bg-slate-900 border-slate-800 text-white">
          <CardHeader className="pb-2">
            <h1 className="text-2xl font-black text-[#E63946]">NicAntojo</h1>
            <CardTitle className="text-lg text-slate-300 font-medium">Panel de Propietario</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="text-sm text-slate-400 mb-1 block">Correo electrónico</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-[#E63946]"
                  placeholder="tu@correo.com"
                />
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-1 block">Contraseña</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-[#E63946]"
                  placeholder="••••••••"
                />
              </div>
              {authError && (
                <p className="text-red-400 text-sm">{authError}</p>
              )}
              <Button
                type="submit"
                disabled={authLoading}
                className="w-full bg-[#E63946] hover:bg-red-700 text-white font-bold"
              >
                {authLoading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    );
  }

  // DASHBOARD
  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <header className="mb-8 flex items-center justify-between border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-black text-[#E63946]">NicAntojo <span className="text-white">Owner</span></h1>
          <p className="text-slate-400 text-sm mt-1">{user.email}</p>
        </div>
        <Button onClick={handleLogout} variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800">
          Cerrar sesión
        </Button>
      </header>

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-slate-200">Mis Restaurantes</h2>
        <Button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="bg-[#E63946] hover:bg-red-700 text-white font-bold"
        >
          + Nuevo Restaurante
        </Button>
      </div>

      {/* CREATE RESTAURANT FORM */}
      {showCreateForm && (
        <Card className="bg-slate-900 border-slate-800 text-white mb-6">
          <CardHeader>
            <CardTitle className="text-slate-200">Crear Restaurante</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateRestaurant} className="grid grid-cols-2 gap-4">
              <div className="col-span-2 md:col-span-1">
                <label className="text-sm text-slate-400 mb-1 block">Nombre *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-[#E63946]"
                  placeholder="Fritanga La Abuela"
                />
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className="text-sm text-slate-400 mb-1 block">Dirección *</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-[#E63946]"
                  placeholder="Managua, Nicaragua"
                />
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-1 block">Categorías</label>
                <input
                  type="text"
                  value={form.categories}
                  onChange={(e) => setForm({ ...form, categories: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-[#E63946]"
                  placeholder="Comida típica, Fritanga"
                />
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-1 block">Tiempo de entrega</label>
                <input
                  type="text"
                  value={form.delivery_time}
                  onChange={(e) => setForm({ ...form, delivery_time: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-[#E63946]"
                  placeholder="30-45 min"
                />
              </div>
              <div className="col-span-2">
                <label className="text-sm text-slate-400 mb-1 block">URL de imagen</label>
                <input
                  type="url"
                  value={form.image_url}
                  onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-[#E63946]"
                  placeholder="https://..."
                />
              </div>
              {createError && (
                <p className="col-span-2 text-red-400 text-sm">{createError}</p>
              )}
              <div className="col-span-2 flex gap-3">
                <Button type="submit" disabled={creating} className="bg-[#E63946] hover:bg-red-700 text-white font-bold">
                  {creating ? 'Creando...' : 'Crear Restaurante'}
                </Button>
                <Button type="button" onClick={() => setShowCreateForm(false)} variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800">
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* RESTAURANT LIST */}
      {restaurants.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <p className="text-lg">No tienes restaurantes aún.</p>
          <p className="text-sm mt-1">Crea uno para comenzar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {restaurants.map((r) => (
            <Card
              key={r.id}
              className="bg-slate-900 border-slate-800 text-white cursor-pointer hover:border-[#E63946] transition-colors"
              onClick={() => router.push(`/owner/${r.id}`)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg text-white">{r.name}</CardTitle>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${r.is_open ? 'bg-green-950 text-green-400' : 'bg-red-950 text-red-400'}`}>
                    {r.is_open ? 'Abierto' : 'Cerrado'}
                  </span>
                </div>
                <p className="text-slate-400 text-sm">{r.address}</p>
              </CardHeader>
              <CardContent>
                <p className="text-slate-500 text-xs">{r.categories || 'Sin categoría'}</p>
                <Button
                  className="mt-4 w-full bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm"
                  onClick={(e) => { e.stopPropagation(); router.push(`/owner/${r.id}`); }}
                >
                  Gestionar Menú →
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
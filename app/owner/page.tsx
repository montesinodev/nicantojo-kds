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
      const { data } = await supabase.auth.getSession();

      const session = data?.session;
      const sessionUser = session?.user ?? null;

      if (sessionUser) {
        setUser(sessionUser);
        await fetchRestaurants(sessionUser.id);
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
      console.error(error.message);
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

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setAuthError(error.message);
      setAuthLoading(false);
      return;
    }

    const sessionUser = data?.user;

    setUser(sessionUser);
    if (sessionUser) await fetchRestaurants(sessionUser.id);

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

    if (!user?.id) {
      setCreateError('User session not found.');
      setCreating(false);
      return;
    }

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

    await fetchRestaurants(user.id);

    setShowCreateForm(false);
    setForm({
      name: '',
      address: '',
      categories: '',
      delivery_time: '',
      image_url: '',
    });

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

  if (!user) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <Card className="w-full max-w-md bg-slate-900 border-slate-800 text-white">
          <CardHeader>
            <h1 className="text-2xl font-black text-[#E63946]">NicAntojo</h1>
            <CardTitle className="text-lg text-slate-300">
              Panel de Propietario
            </CardTitle>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Correo"
                className="w-full bg-slate-800 p-2 rounded"
              />

              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña"
                className="w-full bg-slate-800 p-2 rounded"
              />

              {authError && (
                <p className="text-red-400 text-sm">{authError}</p>
              )}

              <Button disabled={authLoading} className="w-full bg-[#E63946]">
                {authLoading ? 'Entrando...' : 'Login'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <header className="flex justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#E63946]">
            Owner Dashboard
          </h1>
          <p className="text-sm text-slate-400">{user.email}</p>
        </div>

        <Button onClick={handleLogout}>Logout</Button>
      </header>

      <div className="flex justify-between mb-4">
        <h2 className="text-lg">Mis restaurantes</h2>

        <Button onClick={() => setShowCreateForm(!showCreateForm)}>
          + Nuevo
        </Button>
      </div>

      {showCreateForm && (
        <Card className="mb-6 bg-slate-900">
          <CardContent>
            <form onSubmit={handleCreateRestaurant} className="space-y-2">
              <input
                placeholder="Nombre"
                value={form.name}
                onChange={(e) =>
                  setForm({ ...form, name: e.target.value })
                }
                className="w-full bg-slate-800 p-2 rounded"
              />

              <input
                placeholder="Dirección"
                value={form.address}
                onChange={(e) =>
                  setForm({ ...form, address: e.target.value })
                }
                className="w-full bg-slate-800 p-2 rounded"
              />

              {createError && (
                <p className="text-red-400 text-sm">{createError}</p>
              )}

              <Button disabled={creating}>
                {creating ? 'Creando...' : 'Crear'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {restaurants.map((r) => (
          <Card
            key={r.id}
            className="bg-slate-900 cursor-pointer"
            onClick={() => router.push(`/owner/${r.id}`)}
          >
            <CardHeader>
              <CardTitle>{r.name}</CardTitle>
              <p className="text-sm text-slate-400">{r.address}</p>
            </CardHeader>
          </Card>
        ))}
      </div>
    </main>
  );
}
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
  image_url: string | null;
  rating: number | null;
  delivery_time: string | null;
  categories: string | null;
  is_open: boolean;
}

const emptyForm = {
  name: '',
  address: '',
  image_url: '',
  categories: '',
  delivery_time: '',
};

export default function OwnerPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) loadRestaurants();
    });
  }, []);

  async function loadRestaurants() {
    const { data: memberships } = await supabase
      .from('memberships')
      .select('restaurant_id')
      .eq('role', 'owner');

    if (!memberships?.length) return;

    const ids = memberships.map((m) => m.restaurant_id);
    const { data } = await supabase
      .from('restaurants')
      .select('*')
      .in('id', ids);

    setRestaurants(data || []);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setAuthError('');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setAuthError(error.message);
    } else {
      setSession(data.session);
      loadRestaurants();
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setSession(null);
    setRestaurants([]);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError('');

    const { data, error } = await supabase.rpc('create_restaurant', {
      p_name: form.name,
      p_address: form.address,
      p_image_url: form.image_url || null,
      p_categories: form.categories || null,
      p_delivery_time: form.delivery_time || null,
    });

    setCreating(false);

    if (error) {
      setCreateError(error.message);
    } else {
      setForm(emptyForm);
      setShowCreate(false);
      loadRestaurants();
    }
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-slate-900 border-slate-800">
          <CardHeader className="text-center pb-2">
            <div className="w-12 h-12 bg-[#E63946] rounded-xl flex items-center justify-center mx-auto mb-3">
              <span className="text-white text-xl font-bold">N</span>
            </div>
            <CardTitle className="text-white text-xl">Panel de Propietario</CardTitle>
            <p className="text-slate-400 text-sm mt-1">NicAntojo</p>
          </CardHeader>
          <CardContent className="pt-4">
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
                <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
                  {authError}
                </p>
              )}
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-[#E63946] hover:bg-[#c1121f] text-white font-semibold py-2.5"
              >
                {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#E63946] rounded-lg flex items-center justify-center">
              <span className="text-white text-sm font-bold">N</span>
            </div>
            <div>
              <h1 className="text-white font-semibold text-sm">NicAntojo</h1>
              <p className="text-slate-500 text-xs">Panel de Propietario</p>
            </div>
          </div>
          <Button
            onClick={handleLogout}
            variant="ghost"
            className="text-slate-400 hover:text-white hover:bg-slate-800 text-sm"
          >
            Cerrar sesión
          </Button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Page title */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white">Mis restaurantes</h2>
            <p className="text-slate-400 text-sm mt-1">
              {restaurants.length === 0
                ? 'Crea tu primer restaurante para empezar'
                : `${restaurants.length} restaurante${restaurants.length !== 1 ? 's' : ''} registrado${restaurants.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <Button
            onClick={() => setShowCreate(!showCreate)}
            className="bg-[#E63946] hover:bg-[#c1121f] text-white font-semibold px-5"
          >
            {showCreate ? 'Cancelar' : '+ Nuevo restaurante'}
          </Button>
        </div>

        {/* Create form */}
        {showCreate && (
          <Card className="bg-slate-900 border-slate-800 mb-8">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-lg">Registrar restaurante</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Name */}
                <div>
                  <label className="text-sm text-slate-400 mb-1 block">Nombre del restaurante *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. La Fritanga de Doña Rosa"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-[#E63946]"
                  />
                </div>

                {/* Address */}
                <div>
                  <label className="text-sm text-slate-400 mb-1 block">Dirección *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Semáforos del Colonial 1c al sur"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-[#E63946]"
                  />
                </div>

                {/* Categories */}
                <div>
                  <label className="text-sm text-slate-400 mb-1 block">Categorías</label>
                  <input
                    type="text"
                    placeholder="Ej. Comida nica, Fritanga, Rápido"
                    value={form.categories}
                    onChange={(e) => setForm({ ...form, categories: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-[#E63946]"
                  />
                </div>

                {/* Delivery time */}
                <div>
                  <label className="text-sm text-slate-400 mb-1 block">Tiempo de entrega estimado</label>
                  <input
                    type="text"
                    placeholder="Ej. 20-35 min"
                    value={form.delivery_time}
                    onChange={(e) => setForm({ ...form, delivery_time: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-[#E63946]"
                  />
                </div>

                {/* Image URL — full width */}
                <div className="md:col-span-2">
                  <label className="text-sm text-slate-400 mb-1 block">URL de imagen</label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={form.image_url}
                    onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-[#E63946]"
                  />
                  {form.image_url && (
                    <img
                      src={form.image_url}
                      alt="Preview"
                      className="mt-2 h-32 w-full object-cover rounded-lg border border-slate-700"
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                      onLoad={(e) => (e.currentTarget.style.display = 'block')}
                    />
                  )}
                </div>

                {createError && (
                  <div className="md:col-span-2">
                    <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
                      {createError}
                    </p>
                  </div>
                )}

                <div className="md:col-span-2 flex justify-end gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => { setShowCreate(false); setForm(emptyForm); setCreateError(''); }}
                    className="text-slate-400 hover:text-white"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={creating}
                    className="bg-[#E63946] hover:bg-[#c1121f] text-white font-semibold px-6"
                  >
                    {creating ? 'Creando...' : 'Crear restaurante'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Restaurant list */}
        {restaurants.length === 0 && !showCreate ? (
          <div className="text-center py-20 text-slate-500">
            <div className="text-5xl mb-4">🍽️</div>
            <p className="text-lg font-medium text-slate-400">No tienes restaurantes aún</p>
            <p className="text-sm mt-1">Haz clic en "Nuevo restaurante" para empezar</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {restaurants.map((r) => (
              <div
                key={r.id}
                onClick={() => router.push(`/owner/${r.id}`)}
                className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden cursor-pointer hover:border-slate-600 hover:bg-slate-800/80 transition-all group"
              >
                {/* Image */}
                <div className="h-40 bg-slate-800 overflow-hidden relative">
                  {r.image_url ? (
                    <img
                      src={r.image_url}
                      alt={r.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-600 text-4xl">
                      🍽️
                    </div>
                  )}
                  {/* Open/closed badge */}
                  <span
                    className={`absolute top-3 right-3 text-xs font-semibold px-2 py-1 rounded-full ${
                      r.is_open
                        ? 'bg-green-900/80 text-green-400 border border-green-700'
                        : 'bg-slate-700/80 text-slate-400 border border-slate-600'
                    }`}
                  >
                    {r.is_open ? 'Abierto' : 'Cerrado'}
                  </span>
                </div>

                {/* Info */}
                <div className="p-4">
                  <h3 className="text-white font-semibold text-base truncate">{r.name}</h3>
                  <p className="text-slate-500 text-xs mt-0.5 truncate">{r.address}</p>

                  <div className="flex items-center gap-3 mt-3 text-xs text-slate-500">
                    {r.delivery_time && (
                      <span className="flex items-center gap-1">
                        🕐 {r.delivery_time}
                      </span>
                    )}
                    {r.rating && (
                      <span className="flex items-center gap-1">
                        ⭐ {r.rating}
                      </span>
                    )}
                  </div>

                  {r.categories && (
                    <p className="text-slate-600 text-xs mt-2 truncate">{r.categories}</p>
                  )}

                  <div className="mt-4 pt-3 border-t border-slate-800">
                    <span className="text-[#E63946] text-xs font-medium group-hover:underline">
                      Gestionar menú →
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
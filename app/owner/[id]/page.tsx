'use client';

import { useEffect, useState } from 'react';
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

const emptyForm = {
  name: '',
  description: '',
  price_cordobas: '',
  category: '',
  image_url: '',
  is_available: true,
};

export default function RestaurantMenuPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/owner');
        return;
      }

      // Verify ownership
      const { data: membership } = await supabase
        .from('memberships')
        .select('role')
        .eq('user_id', session.user.id)
        .eq('restaurant_id', id)
        .eq('role', 'owner')
        .single();

      if (!membership) {
        router.push('/owner');
        return;
      }

      setAuthorized(true);
      await Promise.all([fetchRestaurant(), fetchItems()]);
      setLoading(false);
    }
    init();
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
    const { data, error } = await supabase
      .from('menu_items')
      .select('*')
      .eq('restaurant_id', id)
      .order('category', { ascending: true })
      .order('name', { ascending: true });

    if (error) console.error('Failed to fetch items:', error.message);
    else setItems(data || []);
  }

  function openCreate() {
    setEditingItem(null);
    setForm(emptyForm);
    setFormError('');
    setShowForm(true);
  }

  function openEdit(item: MenuItem) {
    setEditingItem(item);
    setForm({
      name: item.name,
      description: item.description || '',
      price_cordobas: String(item.price_cordobas),
      category: item.category || '',
      image_url: item.image_url || '',
      is_available: item.is_available,
    });
    setFormError('');
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError('');

    const price = parseInt(form.price_cordobas);
    if (isNaN(price) || price < 1) {
      setFormError('El precio debe ser un número entero mayor a 0.');
      setSaving(false);
      return;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      price_cordobas: price,
      category: form.category.trim() || null,
      image_url: form.image_url.trim() || null,
      is_available: form.is_available,
      restaurant_id: id,
    };

    let error;

    if (editingItem) {
      ({ error } = await supabase
        .from('menu_items')
        .update(payload)
        .eq('id', editingItem.id));
    } else {
      ({ error } = await supabase
        .from('menu_items')
        .insert([payload]));
    }

    if (error) {
      setFormError(error.message);
      setSaving(false);
      return;
    }

    await fetchItems();
    setShowForm(false);
    setSaving(false);
  }

  async function toggleAvailability(item: MenuItem) {
    const { error } = await supabase
      .from('menu_items')
      .update({ is_available: !item.is_available })
      .eq('id', item.id);

    if (error) console.error('Failed to toggle availability:', error.message);
    else setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, is_available: !i.is_available } : i));
  }

  async function toggleRestaurantOpen() {
    if (!restaurant) return;
    const { error } = await supabase
      .from('restaurants')
      .update({ is_open: !restaurant.is_open })
      .eq('id', id);

    if (error) console.error('Failed to toggle restaurant:', error.message);
    else setRestaurant((r) => r ? { ...r, is_open: !r.is_open } : r);
  }

  async function softDeleteItem(item: MenuItem) {
    if (!confirm(`¿Eliminar "${item.name}" del menú? Esta acción se puede revertir.`)) return;
    const { error } = await supabase
      .from('menu_items')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', item.id);

    if (error) console.error('Failed to delete item:', error.message);
    else setItems((prev) => prev.filter((i) => i.id !== item.id));
  }

  if (loading || !authorized) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400 animate-pulse">Cargando...</div>
      </main>
    );
  }

  const activeItems = items.filter((i) => !i.deleted_at);

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <header className="mb-8 flex items-center justify-between border-b border-slate-800 pb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/owner')} className="text-slate-400 hover:text-white text-sm">
            ← Mis Restaurantes
          </button>
          <div>
            <h1 className="text-2xl font-black text-white">{restaurant?.name}</h1>
            <p className="text-slate-400 text-sm">{activeItems.length} productos en el menú</p>
          </div>
        </div>
        <Button
          onClick={toggleRestaurantOpen}
          className={restaurant?.is_open ? 'bg-green-900 hover:bg-green-800 text-green-300 border border-green-700' : 'bg-red-900 hover:bg-red-800 text-red-300 border border-red-700'}
        >
          {restaurant?.is_open ? '● Abierto' : '○ Cerrado'}
        </Button>
      </header>

      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-slate-200">Menú</h2>
        <Button onClick={openCreate} className="bg-[#E63946] hover:bg-red-700 text-white font-bold">
          + Agregar Producto
        </Button>
      </div>

      {/* FORM */}
      {showForm && (
        <Card className="bg-slate-900 border-slate-800 text-white mb-6">
          <CardHeader>
            <CardTitle className="text-slate-200">{editingItem ? 'Editar Producto' : 'Nuevo Producto'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="grid grid-cols-2 gap-4">
              <div className="col-span-2 md:col-span-1">
                <label className="text-sm text-slate-400 mb-1 block">Nombre *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-[#E63946]"
                  placeholder="Gallo Pinto"
                />
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className="text-sm text-slate-400 mb-1 block">Precio (C$) *</label>
                <input
                  type="number"
                  value={form.price_cordobas}
                  onChange={(e) => setForm({ ...form, price_cordobas: e.target.value })}
                  required
                  min="1"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-[#E63946]"
                  placeholder="150"
                />
              </div>
              <div className="col-span-2">
                <label className="text-sm text-slate-400 mb-1 block">Descripción</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-[#E63946] resize-none"
                  placeholder="Arroz y frijoles rojos con crema..."
                />
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-1 block">Categoría</label>
                <input
                  type="text"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-[#E63946]"
                  placeholder="Desayunos"
                />
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-1 block">URL de imagen</label>
                <input
                  type="url"
                  value={form.image_url}
                  onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-[#E63946]"
                  placeholder="https://..."
                />
              </div>
              <div className="col-span-2 flex items-center gap-3">
                <input
                  type="checkbox"
                  id="is_available"
                  checked={form.is_available}
                  onChange={(e) => setForm({ ...form, is_available: e.target.checked })}
                  className="w-4 h-4 accent-[#E63946]"
                />
                <label htmlFor="is_available" className="text-slate-300 text-sm">Disponible en el menú</label>
              </div>
              {formError && <p className="col-span-2 text-red-400 text-sm">{formError}</p>}
              <div className="col-span-2 flex gap-3">
                <Button type="submit" disabled={saving} className="bg-[#E63946] hover:bg-red-700 text-white font-bold">
                  {saving ? 'Guardando...' : editingItem ? 'Guardar Cambios' : 'Agregar Producto'}
                </Button>
                <Button type="button" onClick={() => setShowForm(false)} variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800">
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* MENU ITEMS */}
      {activeItems.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <p className="text-lg">El menú está vacío.</p>
          <p className="text-sm mt-1">Agrega tu primer producto para comenzar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeItems.map((item) => (
            <Card key={item.id} className={`bg-slate-900 border-slate-800 text-white ${!item.is_available ? 'opacity-50' : ''}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base text-white leading-tight">{item.name}</CardTitle>
                  <span className="text-[#E63946] font-black text-lg whitespace-nowrap">C$ {item.price_cordobas}</span>
                </div>
                {item.category && <p className="text-slate-500 text-xs uppercase tracking-wide">{item.category}</p>}
              </CardHeader>
              <CardContent>
                {item.description && (
                  <p className="text-slate-400 text-sm mb-4 line-clamp-2">{item.description}</p>
                )}
                <div className="flex gap-2 flex-wrap">
                  <Button
                    onClick={() => toggleAvailability(item)}
                    size="sm"
                    className={item.is_available ? 'bg-green-900 hover:bg-green-800 text-green-300 text-xs' : 'bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs'}
                  >
                    {item.is_available ? '● Disponible' : '○ No disponible'}
                  </Button>
                  <Button
                    onClick={() => openEdit(item)}
                    size="sm"
                    variant="outline"
                    className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs"
                  >
                    Editar
                  </Button>
                  <Button
                    onClick={() => softDeleteItem(item)}
                    size="sm"
                    variant="outline"
                    className="border-red-900 text-red-400 hover:bg-red-950 text-xs"
                  >
                    Eliminar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
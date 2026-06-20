'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Restaurant {
  id: string;
  name: string;
  address: string;
  image_url: string | null;
  is_open: boolean;
  categories: string | null;
  delivery_time: string | null;
}

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price_cordobas: number;
  image_url: string | null;
  is_available: boolean;
  category: string | null;
  deleted_at: string | null;
}

const emptyItemForm = {
  name: '',
  description: '',
  price_cordobas: '',
  image_url: '',
  category: '',
  is_available: true,
};

export default function RestaurantMenuPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notOwner, setNotOwner] = useState(false);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyItemForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!id) return;
    init();
  }, [id]);

  async function init() {
    setLoading(true);

    // Verify ownership
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/owner'); return; }

    const { data: membership } = await supabase
      .from('memberships')
      .select('id')
      .eq('user_id', user.id)
      .eq('restaurant_id', id)
      .eq('role', 'owner')
      .maybeSingle();

    if (!membership) { setNotOwner(true); setLoading(false); return; }

    // Load restaurant + menu
    const [{ data: rest }, { data: menu }] = await Promise.all([
      supabase.from('restaurants').select('*').eq('id', id).single(),
      supabase
        .from('menu_items')
        .select('*')
        .eq('restaurant_id', id)
        .is('deleted_at', null)
        .order('category')
        .order('name'),
    ]);

    setRestaurant(rest);
    setItems(menu || []);
    setLoading(false);
  }

  // Group items by category
  const grouped = useMemo(() => {
    const map: Record<string, MenuItem[]> = {};
    for (const item of items) {
      const key = item.category || 'Sin categoría';
      if (!map[key]) map[key] = [];
      map[key].push(item);
    }
    return map;
  }, [items]);

  async function toggleOpen() {
    if (!restaurant) return;
    const { data } = await supabase
      .from('restaurants')
      .update({ is_open: !restaurant.is_open })
      .eq('id', id)
      .select()
      .single();
    if (data) setRestaurant(data);
  }

  async function toggleAvailability(item: MenuItem) {
    const { data } = await supabase
      .from('menu_items')
      .update({ is_available: !item.is_available })
      .eq('id', item.id)
      .select()
      .single();
    if (data) setItems((prev) => prev.map((i) => (i.id === item.id ? data : i)));
  }

  async function deleteItem(itemId: string) {
    await supabase
      .from('menu_items')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', itemId);
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  }

  function openNewForm() {
    setEditingId(null);
    setForm(emptyItemForm);
    setFormError('');
    setShowForm(true);
  }

  function openEditForm(item: MenuItem) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      description: item.description || '',
      price_cordobas: String(item.price_cordobas),
      image_url: item.image_url || '',
      category: item.category || '',
      is_available: item.is_available,
    });
    setFormError('');
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyItemForm);
    setFormError('');
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError('');

    const price = parseInt(form.price_cordobas, 10);
    if (isNaN(price) || price <= 0) {
      setFormError('El precio debe ser un número mayor a 0.');
      setSaving(false);
      return;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      price_cordobas: price,
      image_url: form.image_url.trim() || null,
      category: form.category.trim() || null,
      is_available: form.is_available,
      restaurant_id: id,
    };

    let error;
    if (editingId) {
      const res = await supabase.from('menu_items').update(payload).eq('id', editingId).select().single();
      error = res.error;
      if (res.data) setItems((prev) => prev.map((i) => (i.id === editingId ? res.data : i)));
    } else {
      const res = await supabase.from('menu_items').insert(payload).select().single();
      error = res.error;
      if (res.data) setItems((prev) => [...prev, res.data]);
    }

    setSaving(false);
    if (error) {
      setFormError(error.message);
    } else {
      cancelForm();
    }
  }

  // --- States ---

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400 text-sm">Cargando...</div>
      </div>
    );
  }

  if (notOwner) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 font-medium mb-3">No tienes acceso a este restaurante.</p>
          <Button onClick={() => router.push('/owner')} variant="ghost" className="text-slate-400 hover:text-white">
            ← Volver
          </Button>
        </div>
      </div>
    );
  }

  if (!restaurant) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/owner')}
                className="text-slate-400 hover:text-white transition-colors"
              >
                ← Mis restaurantes
              </button>
              <span className="text-slate-700">/</span>
              <span className="text-white font-medium truncate max-w-xs">{restaurant.name}</span>
            </div>

            <div className="flex items-center gap-2">
              {/* KDS link */}
              <Button
                onClick={() => router.push(`/owner/${id}/kds`)}
                variant="outline"
                className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white text-sm"
              >
                🖥️ Ver KDS
              </Button>

              {/* Open/closed toggle */}
              <button
                onClick={toggleOpen}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  restaurant.is_open
                    ? 'bg-green-900/60 text-green-400 border border-green-700 hover:bg-green-900'
                    : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
                }`}
              >
                {restaurant.is_open ? '● Abierto' : '○ Cerrado'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-white">Menú</h2>
            <p className="text-slate-500 text-sm mt-0.5">
              {items.length} producto{items.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Button
            onClick={openNewForm}
            className="bg-[#E63946] hover:bg-[#c1121f] text-white font-semibold px-5"
          >
            + Agregar producto
          </Button>
        </div>

        {/* Add / Edit Form */}
        {showForm && (
          <Card className="bg-slate-900 border-slate-800 mb-8">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-base">
                {editingId ? 'Editar producto' : 'Nuevo producto'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Name */}
                <div>
                  <label className="text-sm text-slate-400 mb-1 block">Nombre *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Gallo pinto"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-[#E63946]"
                  />
                </div>

                {/* Price */}
                <div>
                  <label className="text-sm text-slate-400 mb-1 block">Precio (C$) *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    placeholder="Ej. 80"
                    value={form.price_cordobas}
                    onChange={(e) => setForm({ ...form, price_cordobas: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-[#E63946]"
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="text-sm text-slate-400 mb-1 block">Categoría</label>
                  <input
                    type="text"
                    placeholder="Ej. Desayunos, Platos principales"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-[#E63946]"
                  />
                </div>

                {/* Availability toggle */}
                <div className="flex items-center gap-3 pt-6">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, is_available: !form.is_available })}
                    className={`relative w-11 h-6 rounded-full transition-colors ${
                      form.is_available ? 'bg-[#E63946]' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        form.is_available ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <span className="text-slate-300 text-sm">
                    {form.is_available ? 'Disponible' : 'No disponible'}
                  </span>
                </div>

                {/* Description — full width */}
                <div className="md:col-span-2">
                  <label className="text-sm text-slate-400 mb-1 block">Descripción</label>
                  <textarea
                    rows={2}
                    placeholder="Descripción breve del producto (opcional)"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-[#E63946] resize-none"
                  />
                </div>

                {/* Image URL — full width with preview */}
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
                      className="mt-2 h-24 w-full object-cover rounded-lg border border-slate-700"
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                      onLoad={(e) => (e.currentTarget.style.display = 'block')}
                    />
                  )}
                </div>

                {formError && (
                  <div className="md:col-span-2">
                    <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
                      {formError}
                    </p>
                  </div>
                )}

                <div className="md:col-span-2 flex justify-end gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={cancelForm}
                    className="text-slate-400 hover:text-white"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={saving}
                    className="bg-[#E63946] hover:bg-[#c1121f] text-white font-semibold px-6"
                  >
                    {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Agregar producto'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Menu items grouped by category */}
        {items.length === 0 ? (
          <div className="text-center py-20 text-slate-500">
            <div className="text-5xl mb-4">🍴</div>
            <p className="text-lg font-medium text-slate-400">El menú está vacío</p>
            <p className="text-sm mt-1">Agrega tu primer producto para empezar</p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(grouped).map(([category, categoryItems]) => (
              <div key={category}>
                <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-3 pb-2 border-b border-slate-800">
                  {category}
                </h3>
                <div className="space-y-2">
                  {categoryItems.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-center gap-4 bg-slate-900 border rounded-xl p-4 transition-colors ${
                        item.is_available ? 'border-slate-800' : 'border-slate-800 opacity-50'
                      }`}
                    >
                      {/* Image */}
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.name}
                          className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-slate-800 flex items-center justify-center text-2xl flex-shrink-0">
                          🍽️
                        </div>
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-white font-medium truncate">{item.name}</p>
                          {!item.is_available && (
                            <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full flex-shrink-0">
                              No disponible
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <p className="text-slate-500 text-sm truncate mt-0.5">{item.description}</p>
                        )}
                        <p className="text-[#E63946] font-semibold text-sm mt-1">
                          C${item.price_cordobas.toLocaleString()}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Edit */}
                        <button
                          onClick={() => openEditForm(item)}
                          className="text-slate-400 hover:text-white text-xs px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-500 transition-colors"
                        >
                          Editar
                        </button>

                        {/* Toggle availability */}
                        <button
                          onClick={() => toggleAvailability(item)}
                          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                            item.is_available
                              ? 'border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
                              : 'border-green-800 text-green-400 hover:bg-green-900/20'
                          }`}
                        >
                          {item.is_available ? 'Desactivar' : 'Activar'}
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => {
                            if (confirm(`¿Eliminar "${item.name}"?`)) deleteItem(item.id);
                          }}
                          className="text-slate-600 hover:text-red-400 text-xs px-2 py-1.5 rounded-lg hover:bg-red-900/20 transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type PageState = 'loading' | 'set_password' | 'success' | 'error';

export default function AuthConfirmPage() {
  const router = useRouter();
  const [pageState, setPageState] = useState<PageState>('loading');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function handleInviteToken() {
      // Parse hash fragment manually — Next.js doesn't expose it server-side
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);

      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const type = params.get('type'); // 'invite' or 'recovery'

      if (accessToken && refreshToken) {
        // Exchange the tokens from the URL into a real session
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          setError('El enlace es inválido o ha expirado. Pide al propietario que te envíe una nueva invitación.');
          setPageState('error');
          return;
        }

        setPageState('set_password');
        // Clean up the hash from the URL so tokens aren't visible
        window.history.replaceState(null, '', window.location.pathname);
        return;
      }

      // No hash tokens — check if there's already an active session
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setPageState('set_password');
        return;
      }

      // Nothing found
      setError('No se encontró un enlace de invitación válido. Pide al propietario que te envíe una nueva invitación.');
      setPageState('error');
    }

    handleInviteToken();
  }, []);

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    setPageState('success');

    // Redirect based on role after short delay
    setTimeout(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }

      const { data: membership } = await supabase
        .from('memberships')
        .select('role')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      router.push(membership?.role === 'owner' ? '/owner' : '/');
    }, 2000);
  }

  // ── Loading ────────────────────────────────────────────────
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-500 text-sm animate-pulse">Verificando enlace...</p>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────
  if (pageState === 'error') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-slate-900 border-slate-800">
          <CardHeader className="text-center pb-2">
            <div className="text-4xl mb-3">⚠️</div>
            <CardTitle className="text-white text-xl">Enlace inválido</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-slate-400 text-sm mb-6">{error}</p>
            <Button
              onClick={() => router.push('/')}
              className="bg-slate-700 hover:bg-slate-600 text-white"
            >
              Volver al inicio
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Success ────────────────────────────────────────────────
  if (pageState === 'success') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-slate-900 border-slate-800">
          <CardHeader className="text-center pb-2">
            <div className="text-4xl mb-3">✅</div>
            <CardTitle className="text-white text-xl">¡Contraseña configurada!</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-slate-400 text-sm">Tu acceso está listo. Redirigiendo...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Set password ───────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-slate-900 border-slate-800">
        <CardHeader className="text-center pb-2">
          <div className="w-12 h-12 bg-slate-800 border border-slate-700 rounded-xl flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">🔑</span>
          </div>
          <CardTitle className="text-white text-xl">Configura tu contraseña</CardTitle>
          <p className="text-slate-500 text-sm mt-1">
            Elige una contraseña para acceder al KDS de NicAntojo
          </p>
        </CardHeader>
        <CardContent className="pt-4">
          <form onSubmit={handleSetPassword} className="space-y-4">
            <div>
              <label className="text-sm text-slate-400 mb-1 block">Nueva contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="Mínimo 8 caracteres"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-slate-500"
              />
            </div>
            <div>
              <label className="text-sm text-slate-400 mb-1 block">Confirmar contraseña</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Repite la contraseña"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-slate-500"
              />
            </div>

            {error && (
              <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={saving}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2.5"
            >
              {saving ? 'Guardando...' : 'Guardar contraseña y entrar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
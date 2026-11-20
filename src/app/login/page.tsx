'use client';

import React, { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient as createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Mail, ArrowRight, CheckCircle2, AlertCircle, Loader2, Sparkles } from 'lucide-react';

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);

  const urlError = searchParams.get('error')
    ? decodeURIComponent(searchParams.get('error')!)
    : null;

  const errorMessage = customError || urlError;

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setCustomError(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setCustomError('Por favor, informe um endereço de e-mail válido.');
      return;
    }

    setLoading(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const origin = window.location.origin;

      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          emailRedirectTo: `${origin}/auth/callback`,
        },
      });

      if (error) {
        setCustomError(error.message);
      } else {
        setSuccess(true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao processar login';
      setCustomError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white dark:bg-[#121215] border border-slate-200/90 dark:border-neutral-800 rounded-2xl shadow-xl p-8 backdrop-blur-sm">
      {/* Cabeçalho */}
      <div className="flex flex-col items-center text-center mb-8">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center font-bold text-white text-xl shadow-lg shadow-blue-500/25 mb-4">
          L
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-neutral-100 tracking-tight">
          Littera CRM
        </h1>
        <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1">
          Acesso restrito para operadores autorizados
        </p>
      </div>

      {/* Alerta de Erro */}
      {errorMessage && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 flex items-start gap-3 text-red-700 dark:text-red-300 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Erro de Acesso</p>
            <p className="mt-0.5 text-red-600 dark:text-red-400">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Tela de Sucesso */}
      {success ? (
        <div className="text-center py-4 space-y-4 animate-in fade-in duration-300">
          <div className="w-12 h-12 mx-auto rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-neutral-100">
              Link de Acesso Enviado!
            </h2>
            <p className="text-xs text-slate-600 dark:text-neutral-400 mt-1.5 leading-relaxed">
              Enviamos um link mágico para <span className="font-semibold text-slate-900 dark:text-neutral-200">{email}</span>.
              Basta clicar no link recebido em sua caixa de entrada para entrar no CRM.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setSuccess(false);
              setEmail('');
              setCustomError(null);
            }}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline pt-2 inline-block cursor-pointer"
          >
            Tentar outro e-mail
          </button>
        </div>
      ) : (
        /* Formulário de Envio */
        <form onSubmit={handleSendMagicLink} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-semibold text-slate-700 dark:text-neutral-300 mb-2"
            >
              E-mail corporativo autorizado
            </label>
            <div className="relative">
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@littera.com.br"
                disabled={loading}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-neutral-800 bg-slate-50 dark:bg-neutral-900/60 text-slate-900 dark:text-neutral-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition disabled:opacity-50"
              />
              <Mail className="w-4 h-4 text-slate-400 dark:text-neutral-500 absolute left-3.5 top-3" />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-neutral-400 mt-1.5">
              Não é necessária senha. Você receberá um link temporário seguro.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-sm shadow-md shadow-blue-500/20 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Enviando link...</span>
              </>
            ) : (
              <>
                <span>Acessar via Link Mágico</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <div className="pt-4 border-t border-slate-100 dark:border-neutral-800/80 flex items-center justify-center gap-1.5 text-[11px] text-slate-500 dark:text-neutral-400">
            <Sparkles className="w-3.5 h-3.5 text-blue-500" />
            <span>Autenticação protegida por Supabase Auth & RLS</span>
          </div>
        </form>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-slate-50 dark:bg-[#09090b] flex flex-col items-center justify-center p-4">
      <Suspense fallback={<div className="text-slate-500 text-sm">Carregando formulário...</div>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}

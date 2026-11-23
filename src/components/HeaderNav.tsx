'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTheme } from './ThemeProvider';
import { Sun, Moon, ShieldCheck, LogOut, FileText } from 'lucide-react';
import HeaderAgentStatus from './HeaderAgentStatus';
import { createClient as createBrowserSupabaseClient } from '@/lib/supabase/client';
import { getContadorReunioesPendentesAction } from '@/actions/reunioes';

export default function HeaderNav() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [pendentesCount, setPendentesCount] = useState<number>(0);

  useEffect(() => {
    let isMounted = true;
    const fetchPendentes = () => {
      getContadorReunioesPendentesAction()
        .then((count) => {
          if (isMounted) setPendentesCount(count);
        })
        .catch(() => {});
    };

    fetchPendentes();
    const interval = setInterval(fetchPendentes, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleLogout = async () => {
    try {
      const supabase = createBrowserSupabaseClient();
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Erro ao encerrar sessão no Supabase:', err);
    } finally {
      router.push('/login');
      router.refresh();
    }
  };

  return (
    <header className="border-b border-slate-200/80 dark:border-neutral-800/80 bg-white/90 dark:bg-neutral-950/80 backdrop-blur-md sticky top-0 z-40 shadow-xs transition-colors duration-300">
      <div className="w-full px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center font-bold text-white text-base shadow-sm shadow-blue-500/20">
            L
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-800 dark:text-neutral-100 tracking-tight text-sm">
                Littera CRM
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 border border-blue-200/60 dark:border-blue-900/40">
                Prospecção B2B • DF
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          {/* Alerta de Pós-Reunião Pendente de Registro */}
          {pendentesCount > 0 && (
            <Link
              href="/reunioes?filtro=pendentes"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-purple-300 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-bold text-xs animate-pulse hover:bg-purple-100 transition shadow-xs"
              title="Existem reuniões com término há mais de 1h que precisam de registro pós-reunião"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{pendentesCount} pós-reunião pendente{pendentesCount > 1 ? 's' : ''}</span>
            </Link>
          )}

          {/* Status Real do Agente SDR */}
          <HeaderAgentStatus />

          {/* Toggle Modo Claro / Escuro */}
          <button
            type="button"
            onClick={toggleTheme}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-neutral-800 bg-slate-100/80 dark:bg-neutral-900 text-slate-700 dark:text-neutral-300 hover:bg-slate-200/80 dark:hover:bg-neutral-800 transition-all cursor-pointer shadow-xs"
            title={theme === 'dark' ? 'Mudar para Modo Claro' : 'Mudar para Modo Escuro'}
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-4 h-4 text-amber-400" />
                <span className="font-semibold text-xs">Modo Claro</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-blue-600" />
                <span className="font-semibold text-xs">Modo Escuro</span>
              </>
            )}
          </button>

          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 text-slate-600 dark:text-neutral-400">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span className="font-medium">Supabase RLS</span>
          </div>

          {/* Botão Sair (Logout) */}
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-950/60 bg-rose-50/80 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-all cursor-pointer shadow-xs font-semibold"
            title="Encerrar sessão"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sair</span>
          </button>
        </div>
      </div>
    </header>
  );
}

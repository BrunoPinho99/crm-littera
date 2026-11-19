'use client';

import React, { useState, useEffect } from 'react';
import { LeadEscolar } from '@/types/database';
import { X, Building2, User, Mail, Phone, MapPin, Tag } from 'lucide-react';

interface LeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (lead: Partial<LeadEscolar>) => Promise<void>;
  lead?: LeadEscolar | null;
  mode: 'create' | 'edit';
}

export default function LeadModal({
  isOpen,
  onClose,
  onSave,
  lead,
  mode,
}: LeadModalProps) {
  const [formData, setFormData] = useState({
    nome_escola: '',
    cidade: 'Brasília',
    telefone_escola: '',
    email_escola: '',
    nome_decisor: '',
    email_decisor: '',
    status: 'novo' as LeadEscolar['status'],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (lead && mode === 'edit') {
      setFormData({
        nome_escola: lead.nome_escola || '',
        cidade: lead.cidade || 'Brasília',
        telefone_escola: lead.telefone_escola || '',
        email_escola: lead.email_escola || '',
        nome_decisor: lead.nome_decisor || '',
        email_decisor: lead.email_decisor || '',
        status: lead.status || 'novo',
      });
    } else {
      setFormData({
        nome_escola: '',
        cidade: 'Brasília',
        telefone_escola: '',
        email_escola: '',
        nome_decisor: '',
        email_decisor: '',
        status: 'novo',
      });
    }
  }, [lead, mode, isOpen]);

  // Fechar com a tecla Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome_escola.trim()) return;

    setIsSubmitting(true);
    try {
      await onSave({
        ...formData,
        id: lead?.id,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/70 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-neutral-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col my-auto overflow-hidden animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-neutral-800 bg-slate-50/50 dark:bg-neutral-900/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 dark:text-neutral-100 text-base">
                {mode === 'create' ? 'Adicionar Nova Empresa' : 'Editar Empresa / Lead'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-neutral-400">
                Preencha os dados cadastrais e decisor de contato
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:hover:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-neutral-300 mb-1">
              Nome da Empresa / Escola *
            </label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                required
                placeholder="Ex: Colégio Sigma"
                value={formData.nome_escola}
                onChange={(e) => setFormData({ ...formData, nome_escola: e.target.value })}
                className="w-full bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-800 dark:text-neutral-100 placeholder:text-slate-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-neutral-300 mb-1">
                Cidade / Bairro
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Brasília"
                  value={formData.cidade}
                  onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-800 dark:text-neutral-100 placeholder:text-slate-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-neutral-300 mb-1">
                Telefone / WhatsApp
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="(61) 99999-0000"
                  value={formData.telefone_escola}
                  onChange={(e) => setFormData({ ...formData, telefone_escola: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-800 dark:text-neutral-100 placeholder:text-slate-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-neutral-300 mb-1">
              E-mail Comercial da Empresa
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="email"
                placeholder="contato@empresa.com.br"
                value={formData.email_escola}
                onChange={(e) => setFormData({ ...formData, email_escola: e.target.value })}
                className="w-full bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-800 dark:text-neutral-100 placeholder:text-slate-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-neutral-800">
            <span className="text-[11px] font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-wider block mb-2">
              Dados do Decisor (Diretoria / Coordenação)
            </span>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-neutral-300 mb-1">
                  Nome do Decisor
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Ex: Carlos Silva"
                    value={formData.nome_decisor}
                    onChange={(e) => setFormData({ ...formData, nome_decisor: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-800 dark:text-neutral-100 placeholder:text-slate-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-neutral-300 mb-1">
                  E-mail do Decisor
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    placeholder="diretoria@escola.com.br"
                    value={formData.email_decisor}
                    onChange={(e) => setFormData({ ...formData, email_decisor: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-800 dark:text-neutral-100 placeholder:text-slate-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                  />
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-neutral-300 mb-1">
              Status do Pipeline
            </label>
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as LeadEscolar['status'] })}
                className="w-full bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-800 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition cursor-pointer"
              >
                <option value="novo">Novo (Aguardando Abordagem)</option>
                <option value="contato_enviado">Contato Enviado</option>
                <option value="respondido">Respondido</option>
                <option value="reuniao_agendada">Reunião Agendada</option>
              </select>
            </div>
          </div>

          {/* Botões de Ação */}
          <div className="pt-4 border-t border-slate-100 dark:border-neutral-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-500/20 transition cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? 'Salvando...' : mode === 'create' ? 'Cadastrar Empresa' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

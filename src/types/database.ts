export type LeadEscolar = {
  id: string;
  created_at: string;
  nome_escola: string;
  cidade: string;
  telefone_escola: string | null;
  email_escola: string | null;
  nome_decisor: string | null;
  email_decisor: string | null;
  status: 'novo' | 'contato_enviado' | 'respondido' | 'reuniao_agendada';
  ultima_interacao: string | null;
  precisa_revisao?: boolean;
  observacao_revisao?: string | null;
};

export type AgenteExecucao = {
  id: string;
  iniciado_em: string;
  finalizado_em: string | null;
  status: 'rodando' | 'sucesso' | 'erro';
  leads_encontrados: number;
  leads_inseridos: number;
  mensagem: string | null;
};

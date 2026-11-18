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
};

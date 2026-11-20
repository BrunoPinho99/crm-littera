export type StatusQualificacao = 'bruto' | 'enriquecido' | 'qualificado' | 'descartado';

export type StatusFunil = 
  | 'novo' 
  | 'em_sequencia' 
  | 'contato_enviado' 
  | 'respondido' 
  | 'reuniao_agendada' 
  | 'sem_interesse' 
  | 'descadastrado';

export type TipoContato = 
  | 'mantenedor' 
  | 'diretor_geral' 
  | 'diretor_pedagogico' 
  | 'coordenador_em' 
  | 'secretaria' 
  | 'outro';

export type EmailStatus = 
  | 'nao_verificado' 
  | 'valido' 
  | 'invalido' 
  | 'arriscado' 
  | 'catch_all' 
  | 'desconhecido';

export type FonteContato = 
  | 'qsa' 
  | 'site' 
  | 'hunter' 
  | 'snov' 
  | 'apollo' 
  | 'manual' 
  | 'receita';

export type TipoInteracao = 
  | 'email_enviado' 
  | 'email_respondido' 
  | 'email_bounce' 
  | 'email_aberto' 
  | 'descadastro' 
  | 'whatsapp' 
  | 'ligacao' 
  | 'reuniao_agendada' 
  | 'reuniao_realizada' 
  | 'nota' 
  | 'mudanca_status';

export interface Escola {
  id: string;
  codigo_inep: string | null;
  cnpj: string | null;
  nome: string;
  razao_social: string | null;
  nome_fantasia: string | null;
  cidade: string;
  uf: string;
  bairro: string | null;
  endereco: string | null;
  cep: string | null;
  telefone: string | null;
  email_geral: string | null;
  site: string | null;
  dominio: string | null;
  matriculas_em: number | null;
  matriculas_total: number | null;
  oferece_ensino_medio: boolean | null;
  porte_receita: string | null;
  capital_social: number | null;
  situacao_cadastral: string | null;
  chave_dedup?: string;
  score: number | null;
  score_detalhes: Record<string, unknown> | null;
  status_qualificacao: StatusQualificacao;
  motivo_descarte: string | null;
  status_funil: StatusFunil;
  entregue_em: string | null;
  ultima_interacao: string | null;
  precisa_revisao: boolean;
  observacao_revisao: string | null;
  fonte: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface Contato {
  id: string;
  escola_id: string;
  nome: string | null;
  cargo: string | null;
  tipo: TipoContato | null;
  email: string | null;
  email_status: EmailStatus;
  email_verificado_em: string | null;
  telefone: string | null;
  linkedin_url: string | null;
  fonte: FonteContato;
  fonte_url: string | null;
  confianca: number | null;
  principal: boolean;
  descadastrado: boolean;
  criado_em: string;
  atualizado_em: string;
}

export interface Interacao {
  id: string;
  escola_id: string;
  contato_id: string | null;
  tipo: TipoInteracao;
  assunto: string | null;
  conteudo: string | null;
  metadata: Record<string, unknown> | null;
  criado_em: string;
}

export interface EscolaComContatos extends Escola {
  contatos: Contato[];
}

export interface AgenteExecucao {
  id: string;
  iniciado_em: string;
  finalizado_em: string | null;
  status: 'rodando' | 'sucesso' | 'erro';
  leads_encontrados: number;
  leads_inseridos: number;
  mensagem: string | null;
}

/**
 * Interface legada para compatibilidade de tipos transitórios
 */
export interface LeadEscolar {
  id: string;
  created_at: string;
  nome_escola: string;
  cidade: string;
  telefone_escola: string | null;
  email_escola: string | null;
  nome_decisor: string | null;
  email_decisor: string | null;
  status: 'novo' | 'em_sequencia' | 'contato_enviado' | 'respondido' | 'reuniao_agendada' | 'sem_interesse' | 'descadastrado';
  ultima_interacao: string | null;
  precisa_revisao?: boolean;
  observacao_revisao?: string | null;
}

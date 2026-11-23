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
  email_geral_status?: EmailStatus;
  email_geral_verificado_em?: string | null;
  site: string | null;
  dominio: string | null;
  google_place_id?: string | null;
  google_rating?: number | null;
  google_avaliacoes?: number | null;
  site_verificado_em?: string | null;
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
  entregue_lote_id?: string | null;
  resumo_pesquisa?: string | null;
  gancho_personalizacao?: string | null;
  fontes_pesquisa?: string[] | null;
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
  evidencia?: string | null;
  custo?: Record<string, unknown> | null;
  principal: boolean;
  descadastrado: boolean;
  criado_em: string;
  atualizado_em: string;
}

export interface CaixaEnvio {
  id: string;
  email: string;
  nome_remetente: string;
  ativo: boolean;
  limite_diario_inicial: number;
  incremento_semanal: number;
  limite_diario_maximo: number;
  aquecimento_inicio: string;
  enviados_hoje: number;
  data_contador: string;
  assinatura_html: string | null;
  criado_em: string;
}

export interface Descadastro {
  email: string;
  escola_id: string | null;
  contato_id: string | null;
  motivo: string | null;
  criado_em: string;
}

export interface Interacao {
  id: string;
  escola_id: string | null;
  contato_id: string | null;
  caixa_envio_id?: string | null;
  tipo: TipoInteracao;
  assunto: string | null;
  conteudo: string | null;
  provedor_message_id?: string | null;
  provedor_thread_id?: string | null;
  rfc_message_id?: string | null;
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
  etapa_atual?: string | null;
  detalhes?: {
    dias_restantes?: number;
    motivo_incompleto?: string | null;
    erro?: string;
    stack?: string;
    [key: string]: unknown;
  } | null;
  custo_total_usd?: number | null;
  gatilho?: 'agendado' | 'manual' | null;
}

export interface LoteDiario {
  id: string;
  data: string;
  execucao_id: string | null;
  quantidade: number;
  motivo_incompleto: string | null;
  criado_em: string;
}

export interface CustoAgente {
  id: string;
  execucao_id: string | null;
  escola_id: string;
  servico: string;
  unidades: number;
  custo_estimado_usd: number;
  criado_em: string;
}

export interface VerificacaoEmail {
  email: string;
  status: EmailStatus;
  sub_status: string | null;
  provedor: string;
  resposta: Record<string, unknown> | null;
  verificado_em: string;
}

export interface ConfigScore {
  chave: string;
  valor: number | null;
  valor_texto: string | null;
  descricao: string | null;
}

export interface ScoreCriterio {
  criterio: string;
  pontos: number;
  motivo: string;
}

export interface ScoreDetalhes {
  total: number;
  minimo_qualificacao: number;
  tem_email_liberado: boolean;
  calculado_em: string;
  criterios: ScoreCriterio[];
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

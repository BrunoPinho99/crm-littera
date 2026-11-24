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
  | 'receita'
  | 'resposta';

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
  ultimo_history_id?: string | null;
  ultima_leitura_em?: string | null;
  google_refresh_token?: string | null;
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
  respostas?: Resposta[];
  reunioes?: Reuniao[];
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

export type TipoPassoSequencia = 'email_novo' | 'email_resposta' | 'email_outro_contato';

export type StatusInscricao =
  | 'ativa'
  | 'pausada'
  | 'concluida'
  | 'respondida'
  | 'reuniao'
  | 'cancelada'
  | 'bounce'
  | 'descadastrada';

export type StatusFilaEnvio =
  | 'aguardando_aprovacao'
  | 'aprovado'
  | 'enviado'
  | 'erro'
  | 'descartado';

export interface Sequencia {
  id: string;
  nome: string;
  ativa: boolean;
  modo_aprovacao: boolean;
  criado_em: string;
}

export interface SequenciaPasso {
  id: string;
  sequencia_id: string;
  ordem: number;
  dias_apos_anterior: number;
  tipo: TipoPassoSequencia;
  assunto_template: string;
  corpo_template: string;
  usar_ia: boolean;
  ativo: boolean;
  criado_em: string;
}

export interface Inscricao {
  id: string;
  escola_id: string;
  contato_id: string | null;
  sequencia_id: string;
  caixa_envio_id: string | null;
  status: StatusInscricao;
  passo_atual: number;
  proximo_envio_em: string | null;
  thread_id: string | null;
  rfc_message_id_inicial: string | null;
  ultimo_rfc_message_id: string | null;
  motivo_fim: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface FilaEnvio {
  id: string;
  inscricao_id: string;
  passo_id: string | null;
  contato_id: string | null;
  para: string;
  assunto: string;
  corpo_html: string;
  corpo_texto: string;
  status: StatusFilaEnvio;
  agendado_para: string;
  enviado_em: string | null;
  erro: string | null;
  criado_em: string;
}

export interface Feriado {
  data: string;
  nome: string;
  abrangencia: 'nacional' | 'distrital' | 'estadual';
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


export type ClassificacaoResposta =
  | 'interessado'
  | 'mais_informacoes'
  | 'agora_nao'
  | 'indicou_outra_pessoa'
  | 'sem_interesse'
  | 'descadastro'
  | 'resposta_automatica'
  | 'bounce'
  | 'outro';

export interface Resposta {
  id: string;
  interacao_id: string | null;
  inscricao_id: string | null;
  escola_id: string;
  contato_id: string | null;
  caixa_envio_id?: string | null;
  de_email: string;
  assunto: string;
  corpo_texto: string;
  recebido_em: string;
  provedor_message_id?: string | null;
  provedor_thread_id?: string | null;
  classificacao: ClassificacaoResposta;
  confianca: number | null;
  justificativa: string | null;
  data_retorno: string | null;
  indicado_nome: string | null;
  indicado_email: string | null;
  rascunho_resposta: string | null;
  tratada: boolean;
  criado_em: string;
}

export interface Lembrete {
  id: string;
  escola_id: string;
  contato_id: string | null;
  data: string;
  texto: string;
  concluido: boolean;
  criado_em: string;
}

export type StatusReuniao =
  | 'agendada'
  | 'remarcada'
  | 'cancelada'
  | 'realizada'
  | 'nao_compareceu';

export type ProvedorReuniao = 'calcom' | 'google' | 'manual';

export type ResultadoReuniao =
  | 'proposta_enviada'
  | 'teste_gratuito'
  | 'fechado'
  | 'sem_fit'
  | 'followup';

export interface Reuniao {
  id: string;
  escola_id: string | null;
  contato_id: string | null;
  inscricao_id: string | null;
  provedor: ProvedorReuniao;
  provedor_evento_id: string | null;
  inicio: string;
  fim: string;
  link_reuniao: string | null;
  status: StatusReuniao;
  resultado: ResultadoReuniao | null;
  notas: string | null;
  pendente_registro: boolean;
  criado_em: string;
  atualizado_em: string;
  escolas?: Escola | null;
  contatos?: Contato | null;
}

export type TipoRotina =
  | 'agente_diario'
  | 'cron_sequencias'
  | 'leitor_respostas'
  | 'agenda'
  | 'verificacao_email';

export type StatusRotina = 'rodando' | 'sucesso' | 'erro';

export interface RotinaExecucao {
  id: string;
  rotina: TipoRotina;
  iniciado_em: string;
  finalizado_em: string | null;
  status: StatusRotina;
  resumo: Record<string, unknown>;
  erro: string | null;
}

export type SeveridadeAlerta = 'info' | 'aviso' | 'erro' | 'critico';

export interface AlertaSistema {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  severidade: SeveridadeAlerta;
  detalhes: Record<string, unknown>;
  ativo: boolean;
  criado_em: string;
  resolvido_em: string | null;
  ultimo_notificado_em: string | null;
}


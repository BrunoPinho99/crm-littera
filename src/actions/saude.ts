'use server';

import { requireUser } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { consultarUltimasExecucoesRotinas } from '@/lib/monitoramento/rotinas';
import { verificarEProtegerEntregabilidadeCaixas, MetricasEntregabilidadeCaixa } from '@/lib/monitoramento/entregabilidade';
import { RotinaExecucao, TipoRotina, AlertaSistema } from '@/types/database';

export interface FunilSemanal {
  entregues: number;
  inscritos: number;
  enviados: number;
  respostas: number;
  reunioes: number;
  taxaInscricao: number; // %
  taxaResposta: number; // %
  taxaReuniao: number; // %
}

export interface CustoDiarioServico {
  data: string;
  places: number;
  claude: number;
  verificador: number;
  hunter: number;
  apify: number;
  total: number;
}

export interface DadosPainelSaude {
  rotinas: Record<TipoRotina, RotinaExecucao | null>;
  funilSemanal: FunilSemanal;
  entregabilidadeCaixas: MetricasEntregabilidadeCaixa[];
  custos30Dias: CustoDiarioServico[];
  totalCusto30Dias: number;
  diasRestantesBase: number;
  leadsDisponiveis: number;
  metaDiaria: number;
  alertasAtivos: AlertaSistema[];
}

export async function getDadosPainelSaudeAction(): Promise<DadosPainelSaude> {
  await requireUser();
  const supabase = getAdminSupabase();

  const data7DiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const data30DiasAtras = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Status das rotinas
  const rotinas = await consultarUltimasExecucoesRotinas();

  // 2. Funil da semana
  // a) Entregues nos lotes dos últimos 7 dias
  const { data: lotes7d } = await supabase
    .from('lotes_diarios')
    .select('quantidade')
    .gte('criado_em', data7DiasAtras);
  const entregues = (lotes7d || []).reduce((acc, l) => acc + (l.quantidade || 0), 0);

  // b) Inscritos nos últimos 7 dias
  const { count: inscritosCount } = await supabase
    .from('inscricoes')
    .select('id', { count: 'exact', head: true })
    .gte('criado_em', data7DiasAtras);
  const inscritos = inscritosCount || 0;

  // c) Enviados nos últimos 7 dias
  const { count: enviadosCount } = await supabase
    .from('mensagens_enviadas')
    .select('id', { count: 'exact', head: true })
    .gte('enviado_em', data7DiasAtras);
  const enviados = enviadosCount || 0;

  // d) Respostas nos últimos 7 dias (excluindo bounce e resposta automática)
  const { count: respostasCount } = await supabase
    .from('respostas_recebidas')
    .select('id', { count: 'exact', head: true })
    .gte('recebido_em', data7DiasAtras)
    .not('classificacao', 'in', '("bounce","resposta_automatica")');
  const respostas = respostasCount || 0;

  // e) Reuniões nos últimos 7 dias
  const { count: reunioesCount } = await supabase
    .from('reunioes')
    .select('id', { count: 'exact', head: true })
    .gte('criado_em', data7DiasAtras)
    .not('status', 'eq', 'cancelada');
  const reunioes = reunioesCount || 0;

  const taxaInscricao = entregues > 0 ? (inscritos / entregues) * 100 : 0;
  const taxaResposta = enviados > 0 ? (respostas / enviados) * 100 : 0;
  const taxaReuniao = respostas > 0 ? (reunioes / respostas) * 100 : 0;

  const funilSemanal: FunilSemanal = {
    entregues,
    inscritos,
    enviados,
    respostas,
    reunioes,
    taxaInscricao: Number(taxaInscricao.toFixed(1)),
    taxaResposta: Number(taxaResposta.toFixed(1)),
    taxaReuniao: Number(taxaReuniao.toFixed(1)),
  };

  // 3. Entregabilidade por caixa
  const { metricas: entregabilidadeCaixas } = await verificarEProtegerEntregabilidadeCaixas(7);

  // 4. Custos do agente por dia nos últimos 30 dias agrupados por serviço
  const { data: custosRaw } = await supabase
    .from('custos_agente')
    .select('servico, custo_usd, criado_em')
    .gte('criado_em', data30DiasAtras)
    .order('criado_em', { ascending: true });

  const custosPorDia: Record<string, CustoDiarioServico> = {};

  // Inicializa mapa dos últimos 30 dias para não haver lacunas
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dataStr = d.toISOString().split('T')[0];
    custosPorDia[dataStr] = {
      data: dataStr,
      places: 0,
      claude: 0,
      verificador: 0,
      hunter: 0,
      apify: 0,
      total: 0,
    };
  }

  let totalCusto30Dias = 0;
  if (custosRaw) {
    for (const c of custosRaw) {
      const dataStr = c.criado_em.split('T')[0];
      const val = parseFloat(c.custo_usd) || 0;
      totalCusto30Dias += val;

      if (!custosPorDia[dataStr]) {
        custosPorDia[dataStr] = {
          data: dataStr,
          places: 0,
          claude: 0,
          verificador: 0,
          hunter: 0,
          apify: 0,
          total: 0,
        };
      }

      const servicoLower = (c.servico || '').toLowerCase();
      if (servicoLower.includes('places')) {
        custosPorDia[dataStr].places += val;
      } else if (servicoLower.includes('claude') || servicoLower.includes('anthropic')) {
        custosPorDia[dataStr].claude += val;
      } else if (servicoLower.includes('verificacao') || servicoLower.includes('zerobounce') || servicoLower.includes('million')) {
        custosPorDia[dataStr].verificador += val;
      } else if (servicoLower.includes('hunter')) {
        custosPorDia[dataStr].hunter += val;
      } else if (servicoLower.includes('apify')) {
        custosPorDia[dataStr].apify += val;
      } else {
        custosPorDia[dataStr].places += val;
      }

      custosPorDia[dataStr].total += val;
    }
  }

  const custos30Dias = Object.values(custosPorDia).map((item) => ({
    ...item,
    places: Number(item.places.toFixed(4)),
    claude: Number(item.claude.toFixed(4)),
    verificador: Number(item.verificador.toFixed(4)),
    hunter: Number(item.hunter.toFixed(4)),
    apify: Number(item.apify.toFixed(4)),
    total: Number(item.total.toFixed(4)),
  }));

  // 5. Dias restantes de base
  const metaDiaria = parseInt(process.env.META_DIARIA || '20', 10);
  const { count: leadsDisponiveisCount } = await supabase
    .from('escolas')
    .select('id', { count: 'exact', head: true })
    .not('score', 'is', null)
    .eq('status_qualificacao', 'qualificado')
    .is('entregue_em', null);

  const leadsDisponiveis = leadsDisponiveisCount || 0;
  const diasRestantesBase = Number((leadsDisponiveis / metaDiaria).toFixed(1));

  // 6. Alertas ativos
  const { data: alertasRaw } = await supabase
    .from('alertas_sistema')
    .select('*')
    .eq('ativo', true)
    .order('criado_em', { ascending: false });

  const alertasAtivos = (alertasRaw || []) as AlertaSistema[];

  return {
    rotinas,
    funilSemanal,
    entregabilidadeCaixas,
    custos30Dias,
    totalCusto30Dias: Number(totalCusto30Dias.toFixed(2)),
    diasRestantesBase,
    leadsDisponiveis,
    metaDiaria,
    alertasAtivos,
  };
}

export async function resolverAlertaAction(alertaId: string): Promise<boolean> {
  await requireUser();
  const supabase = getAdminSupabase();

  const { error } = await supabase
    .from('alertas_sistema')
    .update({
      ativo: false,
      resolvido_em: new Date().toISOString(),
    })
    .eq('id', alertaId);

  return !error;
}

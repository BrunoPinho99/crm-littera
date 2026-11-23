import { CaixaEnvio } from '@/types/database';

export interface LimiteCalculado {
  limiteHoje: number;
  enviadosHojeEfetivo: number;
  disponivelHoje: number;
  podeEnviar: boolean;
  semanas: number;
  diasDesdeInicio: number;
  dataAtualStr: string;
  dataContadorStr: string;
  deveResetarContador: boolean;
}

/**
 * Retorna uma data no fuso 'America/Sao_Paulo' formatada como YYYY-MM-DD
 */
export function formatarDataSaoPaulo(data: Date | string = new Date()): string {
  const d = typeof data === 'string' ? new Date(data) : data;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/**
 * Converte string 'YYYY-MM-DD' para timestamp UTC da meia-noite correspondente
 */
function parseDateToUtcMidnight(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

/**
 * Função pura que calcula o limite de envio diário e o estado do aquecimento para uma caixa.
 * - Calcula semanas completas desde aquecimento_inicio (Math.floor(dias / 7)).
 * - Limite = Math.min(limite_diario_inicial + semanas * incremento_semanal, limite_diario_maximo).
 * - Se ativo === false, limite é 0 e podeEnviar é false.
 * - Reseta logicamente enviados_hoje para 0 se data_contador !== hoje (America/Sao_Paulo).
 */
export function calcularLimiteHoje(
  caixa: Pick<
    CaixaEnvio,
    | 'ativo'
    | 'limite_diario_inicial'
    | 'incremento_semanal'
    | 'limite_diario_maximo'
    | 'aquecimento_inicio'
    | 'enviados_hoje'
    | 'data_contador'
  >,
  dataAtual: Date | string = new Date()
): LimiteCalculado {
  const dataAtualStr = formatarDataSaoPaulo(dataAtual);
  const dataInicioStr = formatarDataSaoPaulo(caixa.aquecimento_inicio);
  const dataContadorStr = formatarDataSaoPaulo(caixa.data_contador);

  const msAtual = parseDateToUtcMidnight(dataAtualStr);
  const msInicio = parseDateToUtcMidnight(dataInicioStr);

  const diffMs = msAtual - msInicio;
  const diasDesdeInicio = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  const semanas = Math.floor(diasDesdeInicio / 7);

  let limiteHoje: number;
  if (!caixa.ativo) {
    limiteHoje = 0;
  } else {
    const incremento = semanas * (caixa.incremento_semanal || 0);
    const limiteTeorico = (caixa.limite_diario_inicial || 0) + incremento;
    limiteHoje = Math.min(limiteTeorico, caixa.limite_diario_maximo || 50);
  }

  const deveResetarContador = dataContadorStr !== dataAtualStr;
  const enviadosHojeEfetivo = deveResetarContador ? 0 : (caixa.enviados_hoje || 0);
  const disponivelHoje = Math.max(0, limiteHoje - enviadosHojeEfetivo);
  const podeEnviar = caixa.ativo && enviadosHojeEfetivo < limiteHoje;

  return {
    limiteHoje,
    enviadosHojeEfetivo,
    disponivelHoje,
    podeEnviar,
    semanas,
    diasDesdeInicio,
    dataAtualStr,
    dataContadorStr,
    deveResetarContador,
  };
}

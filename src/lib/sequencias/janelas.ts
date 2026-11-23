/**
 * Módulo de validação e cálculo de janelas comerciais de envio
 * Horários oficiais (America/Sao_Paulo):
 * - Segunda a Sexta-feira
 * - Manhã: 08:00 às 11:30
 * - Tarde: 14:00 às 17:00
 * - Exceto feriados nacionais e do Distrito Federal
 */

export interface ComponentesHorarioSP {
  ano: number;
  mes: number;
  dia: number;
  diaSemana: number; // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
  hora: number;
  minuto: number;
  segundo: number;
  dataStr: string; // 'YYYY-MM-DD'
}

/**
 * Converte qualquer Date para os componentes exatos no fuso 'America/Sao_Paulo'
 */
export function extrairComponentesSP(data: Date): ComponentesHorarioSP {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  });

  const parts = formatter.formatToParts(data);
  const map: Record<string, string> = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }

  const ano = parseInt(map.year, 10);
  const mes = parseInt(map.month, 10);
  const dia = parseInt(map.day, 10);
  const hora = parseInt(map.hour, 10);
  const minuto = parseInt(map.minute, 10);
  const segundo = parseInt(map.second, 10);
  const dataStr = `${map.year}-${map.month}-${map.day}`;

  // Para dia da semana em SP
  const dateSP = new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
  const diaSemana = dateSP.getUTCDay();

  return { ano, mes, dia, diaSemana, hora, minuto, segundo, dataStr };
}

/**
 * Cria uma Date UTC correspondente a uma data e hora no fuso de São Paulo (UTC-3 fixo)
 */
export function criarDateEmSP(ano: number, mes: number, dia: number, hora: number, minuto: number = 0, segundo: number = 0): Date {
  // America/Sao_Paulo está atualmente em UTC-3 sem horário de verão
  const strIso = `${ano.toString().padStart(4, '0')}-${mes.toString().padStart(2, '0')}-${dia.toString().padStart(2, '0')}T${hora.toString().padStart(2, '0')}:${minuto.toString().padStart(2, '0')}:${segundo.toString().padStart(2, '0')}-03:00`;
  return new Date(strIso);
}

/**
 * Verifica se um determinado momento está dentro das janelas de envio permitidas
 */
export function estaNaJanelaDeEnvio(data: Date, feriadosSet: Set<string> = new Set()): boolean {
  const { diaSemana, hora, minuto, dataStr } = extrairComponentesSP(data);

  // Fim de semana não envia
  if (diaSemana === 0 || diaSemana === 6) {
    return false;
  }

  // Feriado não envia
  if (feriadosSet.has(dataStr)) {
    return false;
  }

  const minutosDoDia = hora * 60 + minuto;
  const manhaInicio = 8 * 60; // 08:00
  const manhaFim = 11 * 60 + 30; // 11:30
  const tardeInicio = 14 * 60; // 14:00
  const tardeFim = 17 * 60; // 17:00

  const naJanelaManha = minutosDoDia >= manhaInicio && minutosDoDia <= manhaFim;
  const naJanelaTarde = minutosDoDia >= tardeInicio && minutosDoDia <= tardeFim;

  return naJanelaManha || naJanelaTarde;
}

/**
 * Encontra a próxima janela comercial válida a partir de uma data fornecida
 */
export function calcularProximaJanelaValida(
  aPartirDe: Date,
  feriadosSet: Set<string> = new Set(),
  permitirMomentoAtualSeValido: boolean = true
): Date {
  if (permitirMomentoAtualSeValido && estaNaJanelaDeEnvio(aPartirDe, feriadosSet)) {
    return new Date(aPartirDe.getTime());
  }

  const compInicial = extrairComponentesSP(aPartirDe);
  let { ano, mes, dia, diaSemana, dataStr } = compInicial;
  const { hora, minuto } = compInicial;
  let minutosDoDia = hora * 60 + minuto;

  const manhaInicio = 8 * 60;
  const manhaFim = 11 * 60 + 30;
  const tardeInicio = 14 * 60;
  const tardeFim = 17 * 60;

  // Itera dia a dia até encontrar uma janela
  for (let diasAdicionais = 0; diasAdicionais < 30; diasAdicionais++) {
    const ehDiaUtil = diaSemana !== 0 && diaSemana !== 6 && !feriadosSet.has(dataStr);

    if (ehDiaUtil) {
      if (diasAdicionais === 0) {
        // Mesmo dia
        if (minutosDoDia < manhaInicio) {
          return criarDateEmSP(ano, mes, dia, 8, 0, 0);
        } else if (minutosDoDia > manhaFim && minutosDoDia < tardeInicio) {
          return criarDateEmSP(ano, mes, dia, 14, 0, 0);
        } else if (minutosDoDia <= tardeFim) {
          // Se já passou das 17:00, cai no próximo dia
        }
      } else {
        // Novo dia útil
        return criarDateEmSP(ano, mes, dia, 8, 0, 0);
      }
    }

    // Avança 1 dia civil
    const proximoDiaDate = new Date(Date.UTC(ano, mes - 1, dia + 1, 12, 0, 0));
    const comp = extrairComponentesSP(proximoDiaDate);
    ano = comp.ano;
    mes = comp.mes;
    dia = comp.dia;
    diaSemana = comp.diaSemana;
    dataStr = comp.dataStr;
    minutosDoDia = 0; // Início do dia
  }

  // Fallback seguro caso atinja limite
  return new Date(aPartirDe.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * Adiciona dias decorridos a uma data e posiciona na próxima janela comercial válida
 */
export function agendarProximoPasso(
  dataBase: Date,
  diasAposAnterior: number,
  feriadosSet: Set<string> = new Set()
): Date {
  if (diasAposAnterior === 0) {
    return calcularProximaJanelaValida(dataBase, feriadosSet, true);
  }

  // Avança dias corridos
  const dataAlvo = new Date(dataBase.getTime() + diasAposAnterior * 24 * 60 * 60 * 1000);
  return calcularProximaJanelaValida(dataAlvo, feriadosSet, false);
}

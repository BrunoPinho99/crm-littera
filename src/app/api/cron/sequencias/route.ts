import { NextRequest, NextResponse } from 'next/server';
import { executarMotorSequencias } from '@/lib/sequencias/motor';
import { lerRespostasDasCaixas } from '@/lib/email/leitor';
import { marcarReunioesPendentesRegistro } from '@/lib/agendamento/posReuniao';
import { executarRotinaComRegistro } from '@/lib/monitoramento/rotinas';
import { verificarEProtegerEntregabilidadeCaixas } from '@/lib/monitoramento/entregabilidade';
import { verificarAlertasSistema } from '@/lib/monitoramento/alertas';

export const dynamic = 'force-dynamic';

export function validarAutorizacaoToken(authHeader: string | null, cronSecret?: string): boolean {
  if (!cronSecret || !cronSecret.trim()) {
    return false;
  }
  if (!authHeader || !authHeader.trim()) {
    return false;
  }
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : authHeader.trim();

  return token === cronSecret;
}

function validarAutorizacao(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('CRON_SECRET não está configurado nas variáveis de ambiente.');
    return false;
  }
  return validarAutorizacaoToken(request.headers.get('authorization'), cronSecret);
}

export async function POST(request: NextRequest) {
  if (!validarAutorizacao(request)) {
    return NextResponse.json(
      { error: 'Não autorizado. Forneça o header Authorization: Bearer <CRON_SECRET>.' },
      { status: 401 }
    );
  }

  const url = new URL(request.url);
  const forcarJanela = url.searchParams.get('forcar') === 'true';
  const limiteParam = url.searchParams.get('limite');
  const limite = limiteParam ? parseInt(limiteParam, 10) : undefined;

  // 1. Leitor de Respostas (Isolado e com registro em rotinas_execucoes)
  const rotinaLeitor = await executarRotinaComRegistro('leitor_respostas', async () => {
    return await lerRespostasDasCaixas();
  });

  // 2. Agenda / Pós-reunião (Isolado e com registro em rotinas_execucoes)
  const rotinaAgenda = await executarRotinaComRegistro('agenda', async () => {
    return await marcarReunioesPendentesRegistro();
  });

  // 3. Proteção automática de entregabilidade (Calcula bounce 7d e desativa caixas se > 3%)
  let resultadoEntregabilidade = { caixasVerificadas: 0, caixasDesativadas: [] as string[] };
  try {
    resultadoEntregabilidade = await verificarEProtegerEntregabilidadeCaixas(7);
  } catch (errEntreg) {
    console.error('Erro na verificação de entregabilidade de caixas:', errEntreg);
  }

  // 4. Motor de Sequências (Isolado e com registro em rotinas_execucoes)
  const rotinaMotor = await executarRotinaComRegistro('cron_sequencias', async () => {
    return await executarMotorSequencias({
      forcarJanela,
      limite,
    });
  });

  // 5. Verificação e Disparo de Alertas do Sistema (No máximo 1 envio por tipo por dia)
  let resultadoAlertas = { alertasGerados: 0, alertasEnviados: 0 };
  try {
    resultadoAlertas = await verificarAlertasSistema();
  } catch (errAlertas) {
    console.error('Erro na verificação de alertas do sistema no cron:', errAlertas);
  }

  const statusGeral =
    rotinaMotor.sucesso && rotinaLeitor.sucesso && rotinaAgenda.sucesso
      ? 'sucesso'
      : 'parcial_com_falhas';

  return NextResponse.json({
    success: rotinaMotor.sucesso,
    status: statusGeral,
    timestamp: new Date().toISOString(),
    leitor: rotinaLeitor.sucesso ? rotinaLeitor.resultado : { erro: rotinaLeitor.erro },
    posReuniao: rotinaAgenda.sucesso ? rotinaAgenda.resultado : { erro: rotinaAgenda.erro },
    entregabilidade: resultadoEntregabilidade,
    motor: rotinaMotor.sucesso ? rotinaMotor.resultado : { erro: rotinaMotor.erro },
    alertas: resultadoAlertas,
  });
}

export async function GET(request: NextRequest) {
  // Permite GET para testes ou provedores como Vercel Cron
  return POST(request);
}

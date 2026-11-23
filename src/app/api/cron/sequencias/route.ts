import { NextRequest, NextResponse } from 'next/server';
import { executarMotorSequencias } from '@/lib/sequencias/motor';
import { lerRespostasDasCaixas } from '@/lib/email/leitor';
import { marcarReunioesPendentesRegistro } from '@/lib/agendamento/posReuniao';

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

  try {
    const url = new URL(request.url);
    const forcarJanela = url.searchParams.get('forcar') === 'true';
    const limiteParam = url.searchParams.get('limite');
    const limite = limiteParam ? parseInt(limiteParam, 10) : undefined;

    // 1. Lê e processa respostas das caixas PRIMEIRO para evitar follow-up indevido
    let resultadoLeitor = { caixasLidas: 0, mensagensProcessadas: 0, erros: [] as Array<{ caixaEmail: string; erro: string }> };
    try {
      resultadoLeitor = await lerRespostasDasCaixas();
    } catch (leitorErr) {
      console.error('Erro na leitura de respostas das caixas:', leitorErr);
    }

    // 2. Marca reuniões passadas há mais de 1 hora como pendentes de registro
    let resultadoPosReuniao = { totalMarcadas: 0, erros: [] as string[] };
    try {
      const resPos = await marcarReunioesPendentesRegistro();
      resultadoPosReuniao = { totalMarcadas: resPos.totalMarcadas, erros: resPos.erros };
    } catch (posErr) {
      console.error('Erro ao verificar reuniões passadas:', posErr);
    }

    // 3. Executa o motor de sequências
    const resultado = await executarMotorSequencias({
      forcarJanela,
      limite,
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      leitor: resultadoLeitor,
      posReuniao: resultadoPosReuniao,
      ...resultado,
    });
  } catch (err) {
    console.error('Erro na execução do cron de sequências:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // Permite GET para testes ou provedores como Vercel Cron
  return POST(request);
}

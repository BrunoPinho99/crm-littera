import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { registrarReuniao } from '@/lib/agendamento/registrar';

export const dynamic = 'force-dynamic';

/**
 * Validação criptográfica da assinatura do webhook do Cal.com via HMAC-SHA256
 * Cabeçalho oficial: X-Cal-Signature-256
 */
export function verificarAssinaturaCalcom(
  rawBody: string,
  signatureHeader: string | null,
  secret?: string
): boolean {
  const webhookSecret = secret || process.env.CALCOM_WEBHOOK_SECRET;
  if (!webhookSecret || !webhookSecret.trim()) {
    return false;
  }
  if (!signatureHeader || !signatureHeader.trim()) {
    return false;
  }

  try {
    const computedSignature = crypto
      .createHmac('sha256', webhookSecret.trim())
      .update(rawBody)
      .digest('hex');

    const signatureBuffer = Buffer.from(signatureHeader.trim());
    const computedBuffer = Buffer.from(computedSignature);

    if (signatureBuffer.length !== computedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(computedBuffer, signatureBuffer);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature =
      request.headers.get('x-cal-signature-256') ||
      request.headers.get('X-Cal-Signature-256');

    // 1. Validação obrigatória da assinatura do webhook
    const assinaturaValida = verificarAssinaturaCalcom(rawBody, signature);
    if (!assinaturaValida) {
      return NextResponse.json(
        { error: 'Assinatura inválida do webhook Cal.com.' },
        { status: 401 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Payload JSON inválido.' }, { status: 400 });
    }

    const triggerEvent = (body.triggerEvent || body.event || body.type || '').toUpperCase();
    const payload = body.payload || body;

    // Identifica o tipo de evento tratado pelo CRM
    let tipoEvento: 'criacao' | 'remarcacao' | 'cancelamento' | null = null;
    if (triggerEvent === 'BOOKING_CREATED') {
      tipoEvento = 'criacao';
    } else if (triggerEvent === 'BOOKING_RESCHEDULED') {
      tipoEvento = 'remarcacao';
    } else if (triggerEvent === 'BOOKING_CANCELLED') {
      tipoEvento = 'cancelamento';
    } else {
      // Eventos não relacionados (ex: MEETING_ENDED) são respondidos com 200
      return NextResponse.json({
        received: true,
        ignored: true,
        triggerEvent,
      });
    }

    // Extrai identificador único do agendamento
    const uid = String(payload.uid || payload.bookingId || payload.id || '');
    if (!uid) {
      return NextResponse.json(
        { error: 'Identificador uid ou bookingId ausente no payload.' },
        { status: 400 }
      );
    }

    // Datas de início e fim
    const inicio = payload.startTime || payload.start_time || payload.start;
    const fim = payload.endTime || payload.end_time || payload.end;

    if (!inicio || !fim) {
      return NextResponse.json(
        { error: 'Datas startTime e endTime são obrigatórias.' },
        { status: 400 }
      );
    }

    // Link de videoconferência
    const linkReuniao =
      payload.videoCallData?.url ||
      payload.meetingUrl ||
      (typeof payload.location === 'string' && payload.location.startsWith('http')
        ? payload.location
        : null) ||
      (typeof payload.metadata?.meeting_url === 'string' ? payload.metadata.meeting_url : null) ||
      null;

    // Participante (attendee)
    const attendee = (payload.attendees && payload.attendees[0]) || {};
    const attendeeEmail = (attendee.email || payload.email || '').trim().toLowerCase() || null;
    const attendeeName = (attendee.name || payload.name || '').trim() || null;

    // 2. Resolução da escola e contato
    // Prioridade 1: Metadados escola_id e contato_id
    const { supabaseAdmin } = await import('@/lib/supabase/admin');
    const metadata = payload.metadata || {};
    let escolaId: string | null = metadata.escola_id || metadata['metadata[escola_id]'] || null;
    let contatoId: string | null = metadata.contato_id || metadata['metadata[contato_id]'] || null;

    if (escolaId) {
      // Valida se o escolaId existe no banco
      const { data: esc } = await supabaseAdmin
        .from('escolas')
        .select('id')
        .eq('id', escolaId)
        .maybeSingle();
      if (!esc) {
        escolaId = null;
      }
    }

    if (contatoId) {
      const { data: ctt } = await supabaseAdmin
        .from('contatos')
        .select('id, escola_id')
        .eq('id', contatoId)
        .maybeSingle();
      if (!ctt) {
        contatoId = null;
      } else if (!escolaId) {
        escolaId = ctt.escola_id;
      }
    }

    // Prioridade 2: Casamento por e-mail do participante
    if (!escolaId && attendeeEmail) {
      // Busca contato com este e-mail
      const { data: contatoMatch } = await supabaseAdmin
        .from('contatos')
        .select('id, escola_id')
        .ilike('email', attendeeEmail)
        .limit(1)
        .maybeSingle();

      if (contatoMatch) {
        escolaId = contatoMatch.escola_id;
        contatoId = contatoMatch.id;
      } else {
        // Busca escola com este e-mail geral
        const { data: escolaMatch } = await supabaseAdmin
          .from('escolas')
          .select('id')
          .ilike('email_geral', attendeeEmail)
          .limit(1)
          .maybeSingle();

        if (escolaMatch) {
          escolaId = escolaMatch.id;
        }
      }
    }

    // 3. Processamento unificado via registrarReuniao (idempotente)
    const resultado = await registrarReuniao({
      provedor: 'calcom',
      provedorEventoId: uid,
      inicio: new Date(inicio).toISOString(),
      fim: new Date(fim).toISOString(),
      linkReuniao,
      escolaId,
      contatoId,
      emailParticipante: attendeeEmail,
      nomeParticipante: attendeeName,
      tipoEvento,
      notas: payload.additionalNotes || payload.description || null,
    });

    if (!resultado.sucesso) {
      console.error('Falha ao processar reunião no webhook Cal.com:', resultado.erro);
      return NextResponse.json(
        { error: resultado.erro || 'Falha ao processar agendamento.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      idempotente: Boolean(resultado.idempotente),
      reuniaoId: resultado.reuniao?.id,
      escolaId,
      tipoEvento,
    });
  } catch (err) {
    console.error('Exceção no webhook Cal.com:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'Erro interno no processamento do webhook', details: msg },
      { status: 500 }
    );
  }
}

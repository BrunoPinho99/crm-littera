import { Escola, Contato, Reuniao } from '@/types/database';

export interface RegistrarReuniaoParams {
  provedor: 'calcom' | 'google' | 'manual';
  provedorEventoId: string;
  inicio: string;
  fim: string;
  linkReuniao?: string | null;
  escolaId?: string | null;
  contatoId?: string | null;
  emailParticipante?: string | null;
  nomeParticipante?: string | null;
  tipoEvento: 'criacao' | 'remarcacao' | 'cancelamento';
  notas?: string | null;
  forcarNotificacao?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbClient?: any;
}

export interface RegistrarReuniaoResult {
  sucesso: boolean;
  reuniao?: Reuniao;
  idempotente?: boolean;
  mensagem?: string;
  erro?: string;
}

/**
 * Formata data e hora no fuso horário oficial de Brasília (America/Sao_Paulo)
 */
export function formatarDataHoraSaoPaulo(dateIso: string): string {
  try {
    const d = new Date(dateIso);
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return dateIso;
  }
}

/**
 * Registra o agendamento, remarcação ou cancelamento de uma reunião.
 * 
 * Executa as ações exigidas no CRM:
 * - Upsert na tabela de reuniões (idempotente via provedor_evento_id)
 * - Se criação:
 *    * Move status_funil da escola para 'reuniao_agendada'
 *    * Encerra inscrições ativas/pausadas da escola com status 'reuniao'
 *    * Descarta itens pendentes na fila_envios
 *    * Registra interação 'reuniao_agendada'
 *    * Envia notificação por e-mail para NOTIFICAR_EMAIL com detalhes da escola e reunião
 *    * Se sem escola correspondente, cria aviso/lembrete de origem desconhecida
 * - Se remarcação:
 *    * Atualiza horários e marca status 'remarcada'
 *    * Registra interação e notifica
 * - Se cancelamento:
 *    * Marca status 'cancelada'
 *    * Retorna status_funil da escola para 'respondido'
 *    * Cria lembrete para o dia seguinte: "Reunião cancelada — tentar reagendar"
 *    * Registra interação e notifica
 */
export async function registrarReuniao(
  params: RegistrarReuniaoParams
): Promise<RegistrarReuniaoResult> {
  const {
    provedor,
    provedorEventoId,
    inicio,
    fim,
    linkReuniao = null,
    escolaId = null,
    contatoId = null,
    emailParticipante = null,
    nomeParticipante = null,
    tipoEvento,
    notas = null,
    dbClient,
  } = params;

  try {
    const agoraIso = new Date().toISOString();
    const dataHoraFormatada = formatarDataHoraSaoPaulo(inicio);

    // Obtém o cliente do Supabase (injetado nos testes ou carregado dinamicamente no servidor)
    const db = dbClient || (await import('@/lib/supabase/admin')).supabaseAdmin;

    // 1. Verifica se já existe reunião com este provedor_evento_id
    const { data: reuniaoExistente } = await db
      .from('reunioes')
      .select('*')
      .eq('provedor_evento_id', provedorEventoId)
      .maybeSingle();

    // 2. Busca dados da escola e contato (se vinculados)
    let escola: Escola | null = null;
    let contato: Contato | null = null;

    if (escolaId) {
      const { data: esc } = await db
        .from('escolas')
        .select('*')
        .eq('id', escolaId)
        .maybeSingle();
      escola = (esc as Escola) || null;
    }

    if (contatoId) {
      const { data: ctt } = await db
        .from('contatos')
        .select('*')
        .eq('id', contatoId)
        .maybeSingle();
      contato = (ctt as Contato) || null;
    }

    // =========================================================================
    // TRATAMENTO DO EVENTO DE CRIAÇÃO
    // =========================================================================
    if (tipoEvento === 'criacao') {
      // Checagem de idempotência: se já existe e está agendada com mesmo horário, não duplica
      if (reuniaoExistente && (reuniaoExistente.status === 'agendada' || reuniaoExistente.status === 'remarcada')) {
        return {
          sucesso: true,
          reuniao: reuniaoExistente as Reuniao,
          idempotente: true,
          mensagem: 'Reunião já registrada anteriormente (idempotência preservada).',
        };
      }

      // Upsert na tabela reunioes
      const payloadReuniao = {
        escola_id: escolaId || null,
        contato_id: contatoId || null,
        provedor,
        provedor_evento_id: provedorEventoId,
        inicio,
        fim,
        link_reuniao: linkReuniao || null,
        status: 'agendada',
        notas: notas || null,
        pendente_registro: false,
        atualizado_em: agoraIso,
      };

      let reuniaoSalva: Reuniao;

      if (reuniaoExistente) {
        const { data: updated, error: updErr } = await db
          .from('reunioes')
          .update(payloadReuniao)
          .eq('id', reuniaoExistente.id)
          .select()
          .single();
        if (updErr || !updated) {
          throw new Error(`Erro ao atualizar reunião existente: ${updErr?.message}`);
        }
        reuniaoSalva = updated as Reuniao;
      } else {
        const { data: inserted, error: insErr } = await db
          .from('reunioes')
          .insert({ ...payloadReuniao, criado_em: agoraIso })
          .select()
          .single();
        if (insErr || !inserted) {
          throw new Error(`Erro ao inserir nova reunião: ${insErr?.message}`);
        }
        reuniaoSalva = inserted as Reuniao;
      }

      // Se há escola identificada:
      if (escolaId && escola) {
        // a) Move escola para 'reuniao_agendada'
        await db
          .from('escolas')
          .update({
            status_funil: 'reuniao_agendada',
            ultima_interacao: agoraIso,
            atualizado_em: agoraIso,
          })
          .eq('id', escolaId);

        // b) Encerra inscrições ativas ou pausadas da escola -> status 'reuniao'
        const { data: inscricoesAtivas } = await db
          .from('inscricoes')
          .select('id')
          .eq('escola_id', escolaId)
          .in('status', ['ativa', 'pausada']);

        if (inscricoesAtivas && inscricoesAtivas.length > 0) {
          const idsInscricoes = inscricoesAtivas.map((i: { id: string }) => i.id);

          await db
            .from('inscricoes')
            .update({
              status: 'reuniao',
              motivo_fim: 'reuniao_agendada',
              atualizado_em: agoraIso,
            })
            .in('id', idsInscricoes);

          // c) Descarta itens pendentes da fila_envios dessa inscrição
          await db
            .from('fila_envios')
            .update({
              status: 'descartado',
              erro: 'Reunião agendada pelo lead',
            })
            .in('inscricao_id', idsInscricoes)
            .in('status', ['aguardando_aprovacao', 'aprovado']);
        }

        // d) Registra interação 'reuniao_agendada'
        await db.from('interacoes').insert({
          escola_id: escolaId,
          contato_id: contatoId || null,
          tipo: 'reuniao_agendada',
          assunto: `Reunião agendada: ${escola.nome}`,
          conteudo: `Reunião agendada para ${dataHoraFormatada} via ${provedor}.${
            linkReuniao ? ` Link: ${linkReuniao}` : ''
          }`,
          metadata: {
            provedor,
            provedor_evento_id: provedorEventoId,
            inicio,
            fim,
            link_reuniao: linkReuniao,
          },
          criado_em: agoraIso,
        });

        // e) Envia aviso por e-mail para NOTIFICAR_EMAIL
        await enviarAvisoEmailAgendamento({
          escola,
          contato,
          dataHoraFormatada,
          linkReuniao,
          emailParticipante,
          nomeParticipante,
          tipo: 'criacao',
        });
      } else {
        // Reunião de origem desconhecida (sem casamento de escola)
        const attendeeInfo = nomeParticipante
          ? `${nomeParticipante} (${emailParticipante || 'Sem e-mail'})`
          : emailParticipante || 'Participante desconhecido';

        const hojeData = new Date().toISOString().split('T')[0];

        // Cria lembrete para vincular manualmente
        await db.from('lembretes').insert({
          escola_id: null,
          contato_id: null,
          data: hojeData,
          texto: `Reunião de origem desconhecida: ${attendeeInfo} agendou para ${dataHoraFormatada}. Vincular manualmente à escola no CRM.`,
          concluido: false,
          criado_em: agoraIso,
        });

        // Notifica por e-mail
        await enviarAvisoEmailOrigemDesconhecida({
          attendeeInfo,
          emailParticipante,
          dataHoraFormatada,
          linkReuniao,
        });
      }

      return {
        sucesso: true,
        reuniao: reuniaoSalva,
        mensagem: 'Reunião criada e processada com sucesso no CRM.',
      };
    }

    // =========================================================================
    // TRATAMENTO DO EVENTO DE REMARCAÇÃO
    // =========================================================================
    if (tipoEvento === 'remarcacao') {
      const payloadRemarcacao = {
        inicio,
        fim,
        link_reuniao: linkReuniao || reuniaoExistente?.link_reuniao || null,
        status: 'remarcada',
        pendente_registro: false,
        atualizado_em: agoraIso,
      };

      let reuniaoSalva: Reuniao;

      if (reuniaoExistente) {
        const { data: updated, error: updErr } = await db
          .from('reunioes')
          .update(payloadRemarcacao)
          .eq('id', reuniaoExistente.id)
          .select()
          .single();
        if (updErr || !updated) {
          throw new Error(`Erro ao remarcar reunião: ${updErr?.message}`);
        }
        reuniaoSalva = updated as Reuniao;
      } else {
        // Se a remarcação chegou sem criação prévia, insere como remarcada
        const { data: inserted, error: insErr } = await db
          .from('reunioes')
          .insert({
            ...payloadRemarcacao,
            escola_id: escolaId || null,
            contato_id: contatoId || null,
            provedor,
            provedor_evento_id: provedorEventoId,
            criado_em: agoraIso,
          })
          .select()
          .single();
        if (insErr || !inserted) {
          throw new Error(`Erro ao inserir reunião remarcada: ${insErr?.message}`);
        }
        reuniaoSalva = inserted as Reuniao;
      }

      if (escolaId && escola) {
        await db
          .from('escolas')
          .update({
            status_funil: 'reuniao_agendada',
            ultima_interacao: agoraIso,
            atualizado_em: agoraIso,
          })
          .eq('id', escolaId);

        // Registra interação de remarcação
        await db.from('interacoes').insert({
          escola_id: escolaId,
          contato_id: contatoId || null,
          tipo: 'reuniao_agendada',
          assunto: `Reunião remarcada: ${escola.nome}`,
          conteudo: `Reunião remarcada para ${dataHoraFormatada}.${
            linkReuniao ? ` Link: ${linkReuniao}` : ''
          }`,
          metadata: {
            provedor,
            provedor_evento_id: provedorEventoId,
            inicio,
            fim,
            link_reuniao: linkReuniao,
            remarcada: true,
          },
          criado_em: agoraIso,
        });

        // Envia notificação por e-mail de remarcação
        await enviarAvisoEmailAgendamento({
          escola,
          contato,
          dataHoraFormatada,
          linkReuniao: linkReuniao || reuniaoSalva.link_reuniao,
          emailParticipante,
          nomeParticipante,
          tipo: 'remarcacao',
        });
      }

      return {
        sucesso: true,
        reuniao: reuniaoSalva,
        mensagem: 'Reunião remarcada com sucesso.',
      };
    }

    // =========================================================================
    // TRATAMENTO DO EVENTO DE CANCELAMENTO
    // =========================================================================
    if (tipoEvento === 'cancelamento') {
      let reuniaoSalva: Reuniao | null = null;

      if (reuniaoExistente) {
        const { data: updated } = await db
          .from('reunioes')
          .update({
            status: 'cancelada',
            pendente_registro: false,
            atualizado_em: agoraIso,
          })
          .eq('id', reuniaoExistente.id)
          .select()
          .single();
        reuniaoSalva = (updated as Reuniao) || null;
      }

      if (escolaId && escola) {
        // Status do funil volta para 'respondido'
        await db
          .from('escolas')
          .update({
            status_funil: 'respondido',
            ultima_interacao: agoraIso,
            atualizado_em: agoraIso,
          })
          .eq('id', escolaId);

        // Cria lembrete para o dia seguinte: "Reunião cancelada — tentar reagendar"
        const amanha = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        await db.from('lembretes').insert({
          escola_id: escolaId,
          contato_id: contatoId || null,
          data: amanha,
          texto: `Reunião cancelada — tentar reagendar com ${escola.nome}`,
          concluido: false,
          criado_em: agoraIso,
        });

        // Registra interação de cancelamento
        await db.from('interacoes').insert({
          escola_id: escolaId,
          contato_id: contatoId || null,
          tipo: 'mudanca_status',
          assunto: `Reunião cancelada: ${escola.nome}`,
          conteudo: `Reunião cancelada pelo lead. Status do funil retornou para 'respondido'. Lembrete criado para ${amanha}.`,
          metadata: {
            provedor,
            provedor_evento_id: provedorEventoId,
            cancelada_em: agoraIso,
          },
          criado_em: agoraIso,
        });

        // Notifica por e-mail
        await enviarAvisoEmailAgendamento({
          escola,
          contato,
          dataHoraFormatada,
          linkReuniao,
          emailParticipante,
          nomeParticipante,
          tipo: 'cancelamento',
        });
      }

      return {
        sucesso: true,
        reuniao: reuniaoSalva || undefined,
        mensagem: 'Reunião cancelada e status do funil revertido com sucesso.',
      };
    }

    return {
      sucesso: false,
      erro: `Tipo de evento desconhecido: ${tipoEvento}`,
    };
  } catch (err) {
    console.error('Erro em registrarReuniao:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return { sucesso: false, erro: msg };
  }
}

/**
 * Envia notificação por e-mail para NOTIFICAR_EMAIL sobre criação, remarcação ou cancelamento
 */
async function enviarAvisoEmailAgendamento(dados: {
  escola: Escola;
  contato: Contato | null;
  dataHoraFormatada: string;
  linkReuniao: string | null;
  emailParticipante: string | null;
  nomeParticipante: string | null;
  tipo: 'criacao' | 'remarcacao' | 'cancelamento';
}) {
  const destinatario = process.env.NOTIFICAR_EMAIL || 'bruno@grupolittera.com.br';
  const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://littera.app.br';
  const linkLead = `${baseUrl}/?escola=${dados.escola.id}`;

  const titulos = {
    criacao: `[Littera CRM] 🗓️ Reunião agendada: ${dados.escola.nome}`,
    remarcacao: `[Littera CRM] 🔄 Reunião remarcada: ${dados.escola.nome}`,
    cancelamento: `[Littera CRM] ❌ Reunião cancelada: ${dados.escola.nome}`,
  };

  const badgeStatus = {
    criacao: '✅ Agendada com Sucesso',
    remarcacao: '🔄 Horário Alterado (Remarcada)',
    cancelamento: '❌ Reunião Cancelada pelo Lead',
  };

  const decisorNome = dados.contato?.nome || dados.nomeParticipante || 'Decisor / Equipe';
  const decisorCargo = dados.contato?.cargo || 'Não especificado';
  const decisorEmail = dados.contato?.email || dados.emailParticipante || 'Não informado';
  const resumoPesquisa = dados.escola.resumo_pesquisa || dados.escola.gancho_personalizacao || 'Sem resumo de pesquisa prévio registrado no CRM.';

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #1e293b; line-height: 1.5;">
      <div style="background-color: #f8fafc; padding: 24px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 20px;">
        <h2 style="margin-top: 0; color: #0f172a; font-size: 18px; border-bottom: 2px solid #2563eb; padding-bottom: 8px;">
          ${titulos[dados.tipo]}
        </h2>

        <div style="margin-bottom: 16px;">
          <span style="display: inline-block; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 12px; background-color: #dbeafe; color: #1e40af;">
            ${badgeStatus[dados.tipo]}
          </span>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 14px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; width: 130px;"><strong>Escola:</strong></td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${dados.escola.nome} (${dados.escola.cidade}/${dados.escola.uf})</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Decisor:</strong></td>
            <td style="padding: 6px 0; color: #0f172a;">${decisorNome} &lt;${decisorEmail}&gt;</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Cargo:</strong></td>
            <td style="padding: 6px 0; color: #0f172a;">${decisorCargo}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Data e Hora:</strong></td>
            <td style="padding: 6px 0; color: #1d4ed8; font-weight: 700;">${dados.dataHoraFormatada} (Horário de Brasília)</td>
          </tr>
          ${dados.linkReuniao ? `
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Link da Reunião:</strong></td>
            <td style="padding: 6px 0;">
              <a href="${dados.linkReuniao}" target="_blank" style="color: #2563eb; font-weight: 600; text-decoration: underline;">
                Entrar no Google Meet / Videoconferência →
              </a>
            </td>
          </tr>` : ''}
        </table>

        <!-- Bloco de Resumo da Pesquisa do Lead para Preparação -->
        <div style="margin-top: 18px; padding: 14px; background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px;">
          <strong style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; display: block; margin-bottom: 6px;">
            Dossiê de Preparação (Resumo SDR):
          </strong>
          <p style="margin: 0; font-size: 13.5px; color: #334155; line-height: 1.6; white-space: pre-wrap;">
${resumoPesquisa}
          </p>
        </div>

        <div style="margin-top: 24px; text-align: center;">
          <a href="${linkLead}" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 10px 22px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px;">
            Abrir Lead no CRM Littera →
          </a>
        </div>
      </div>
      <p style="font-size: 12px; color: #94a3b8; text-align: center;">
        Alerta automático do módulo de agendamento do CRM Littera.
      </p>
    </div>
  `;

  const texto = `
${titulos[dados.tipo]}
====================================
Escola: ${dados.escola.nome} (${dados.escola.cidade}/${dados.escola.uf})
Decisor: ${decisorNome} <${decisorEmail}>
Cargo: ${decisorCargo}
Data/Hora: ${dados.dataHoraFormatada} (Brasília)
Link da Reunião: ${dados.linkReuniao || 'A definir'}

DOSSIÊ SDR / RESUMO DE PESQUISA:
${resumoPesquisa}

Abrir no CRM: ${linkLead}
  `.trim();

  try {
    const { enviarEmail } = await import('@/lib/envio/enviarEmail');
    await enviarEmail({
      para: destinatario,
      assunto: titulos[dados.tipo],
      html,
      texto,
      isTeste: true,
      escolaId: dados.escola.id,
      contatoId: dados.contato?.id || null,
    });
  } catch (err) {
    console.warn('Falha ao enviar e-mail de alerta de agendamento:', err);
  }
}

/**
 * Envia notificação por e-mail para reuniões de origem desconhecida
 */
async function enviarAvisoEmailOrigemDesconhecida(dados: {
  attendeeInfo: string;
  emailParticipante: string | null;
  dataHoraFormatada: string;
  linkReuniao: string | null;
}) {
  const destinatario = process.env.NOTIFICAR_EMAIL || 'bruno@grupolittera.com.br';
  const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://littera.app.br';

  const assunto = `[Littera CRM] ⚠️ Reunião de origem desconhecida agendada (${dados.emailParticipante || 'Sem e-mail'})`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
      <div style="background-color: #fffbeb; padding: 20px; border-radius: 8px; border: 1px solid #fde68a;">
        <h2 style="margin-top: 0; color: #92400e; font-size: 18px;">
          ⚠️ Reunião de Origem Desconhecida Agendada
        </h2>
        <p style="font-size: 14px; color: #78350f;">
          Um participante agendou uma reunião pela sua agenda, mas o e-mail ou metadados não coincidiram diretamente com nenhuma escola cadastrada no CRM.
        </p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 14px;">
          <tr>
            <td style="padding: 6px 0; color: #92400e; width: 120px;"><strong>Participante:</strong></td>
            <td style="padding: 6px 0; color: #1e293b; font-weight: 600;">${dados.attendeeInfo}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #92400e;"><strong>Data e Hora:</strong></td>
            <td style="padding: 6px 0; color: #1e293b; font-weight: 600;">${dados.dataHoraFormatada}</td>
          </tr>
          ${dados.linkReuniao ? `
          <tr>
            <td style="padding: 6px 0; color: #92400e;"><strong>Link:</strong></td>
            <td style="padding: 6px 0;"><a href="${dados.linkReuniao}" style="color: #2563eb;">Entrar na Reunião →</a></td>
          </tr>` : ''}
        </table>
        <div style="margin-top: 18px; text-align: center;">
          <a href="${baseUrl}/reunioes" style="display: inline-block; background-color: #d97706; color: #ffffff; padding: 10px 20px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 6px;">
            Acessar Painel de Reuniões para Vincular →
          </a>
        </div>
      </div>
    </div>
  `;

  const texto = `
REUNIÃO DE ORIGEM DESCONHECIDA
==============================
Participante: ${dados.attendeeInfo}
Data/Hora: ${dados.dataHoraFormatada}
Link: ${dados.linkReuniao || 'A definir'}

Acesse o CRM para vincular a reunião à escola correspondente: ${baseUrl}/reunioes
  `.trim();

  try {
    const { enviarEmail } = await import('@/lib/envio/enviarEmail');
    await enviarEmail({
      para: destinatario,
      assunto,
      html,
      texto,
      isTeste: true,
    });
  } catch (err) {
    console.warn('Falha ao enviar e-mail de reunião de origem desconhecida:', err);
  }
}

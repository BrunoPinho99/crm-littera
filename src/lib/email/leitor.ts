import { supabaseAdmin } from '@/lib/supabase/admin';
import { CaixaEnvio, ClassificacaoResposta } from '@/types/database';
import {
  obterAccessTokenGoogle,
  listarMensagensRecentesGmail,
  obterMensagemGmail,
  extrairDadosMensagemGmail,
  extrairTextoNovoResposta,
  DadosMensagemExtraida,
  GmailMessagePayload,
} from './gmailApi';
import { classificarRespostaComClaude } from './classificador';
import { enviarAvisoNovaResposta } from './notificador';
import {
  detectarBounce,
  detectarRespostaAutomatica,
  extrairDataRetornoTexto,
  calcularDataEnvioAposAusencia,
} from './deteccao';

export {
  detectarBounce,
  detectarRespostaAutomatica,
  extrairDataRetornoTexto,
  calcularDataEnvioAposAusencia,
};

export interface LeadCasado {
  escolaId: string;
  contatoId: string | null;
  inscricaoId: string | null;
  caixaId: string | null;
  escolaNome: string;
  contatoNome: string | null;
  contatoEmail: string;
  ultimoEnvioAssunto: string | null;
}

/**
 * Tenta casar uma mensagem recebida com o funil do CRM usando:
 * 1. Thread ID do provedor (Gmail threadId)
 * 2. RFC Headers (In-Reply-To e References)
 * 3. E-mail do remetente (contato com envio nos últimos 45 dias)
 */
export async function casarComFunil(msg: DadosMensagemExtraida): Promise<LeadCasado | null> {
  // 1. Thread ID do Gmail
  if (msg.provedorThreadId) {
    // Busca em inscricoes
    const { data: inscricaoThread } = await supabaseAdmin
      .from('inscricoes')
      .select('id, escola_id, contato_id, caixa_envio_id, escolas(nome), contatos(nome, email)')
      .eq('thread_id', msg.provedorThreadId)
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (inscricaoThread) {
      const escolaData = inscricaoThread.escolas as unknown as { nome: string } | null;
      const contatoData = inscricaoThread.contatos as unknown as { nome: string | null; email: string } | null;
      return {
        escolaId: inscricaoThread.escola_id,
        contatoId: inscricaoThread.contato_id,
        inscricaoId: inscricaoThread.id,
        caixaId: inscricaoThread.caixa_envio_id,
        escolaNome: escolaData?.nome || 'Escola',
        contatoNome: contatoData?.nome || null,
        contatoEmail: contatoData?.email || msg.remetenteEmail,
        ultimoEnvioAssunto: null,
      };
    }

    // Busca em interacoes
    const { data: interacaoThread } = await supabaseAdmin
      .from('interacoes')
      .select('escola_id, contato_id, caixa_envio_id, assunto, escolas(nome), contatos(nome, email)')
      .eq('provedor_thread_id', msg.provedorThreadId)
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (interacaoThread) {
      const escolaData = interacaoThread.escolas as unknown as { nome: string } | null;
      const contatoData = interacaoThread.contatos as unknown as { nome: string | null; email: string } | null;
      return {
        escolaId: interacaoThread.escola_id,
        contatoId: interacaoThread.contato_id,
        inscricaoId: null,
        caixaId: interacaoThread.caixa_envio_id,
        escolaNome: escolaData?.nome || 'Escola',
        contatoNome: contatoData?.nome || null,
        contatoEmail: contatoData?.email || msg.remetenteEmail,
        ultimoEnvioAssunto: interacaoThread.assunto,
      };
    }
  }

  // 2. RFC Message-IDs (In-Reply-To ou References)
  const rfcIdsParaBuscar = [msg.inReplyTo, ...msg.references].filter((id): id is string => Boolean(id && id.trim()));
  if (rfcIdsParaBuscar.length > 0) {
    // Busca em inscricoes (ultimo_rfc_message_id ou rfc_message_id_inicial)
    const { data: inscricoesRfc } = await supabaseAdmin
      .from('inscricoes')
      .select('id, escola_id, contato_id, caixa_envio_id, ultimo_rfc_message_id, rfc_message_id_inicial, escolas(nome), contatos(nome, email)')
      .or(`ultimo_rfc_message_id.in.(${rfcIdsParaBuscar.join(',')}),rfc_message_id_inicial.in.(${rfcIdsParaBuscar.join(',')})`)
      .order('criado_em', { ascending: false })
      .limit(1);

    if (inscricoesRfc && inscricoesRfc.length > 0) {
      const inscricao = inscricoesRfc[0];
      const escolaData = inscricao.escolas as unknown as { nome: string } | null;
      const contatoData = inscricao.contatos as unknown as { nome: string | null; email: string } | null;
      return {
        escolaId: inscricao.escola_id,
        contatoId: inscricao.contato_id,
        inscricaoId: inscricao.id,
        caixaId: inscricao.caixa_envio_id,
        escolaNome: escolaData?.nome || 'Escola',
        contatoNome: contatoData?.nome || null,
        contatoEmail: contatoData?.email || msg.remetenteEmail,
        ultimoEnvioAssunto: null,
      };
    }

    // Busca em interacoes (rfc_message_id)
    const { data: interacoesRfc } = await supabaseAdmin
      .from('interacoes')
      .select('escola_id, contato_id, caixa_envio_id, assunto, rfc_message_id, escolas(nome), contatos(nome, email)')
      .in('rfc_message_id', rfcIdsParaBuscar)
      .order('criado_em', { ascending: false })
      .limit(1);

    if (interacoesRfc && interacoesRfc.length > 0) {
      const interacao = interacoesRfc[0];
      const escolaData = interacao.escolas as unknown as { nome: string } | null;
      const contatoData = interacao.contatos as unknown as { nome: string | null; email: string } | null;
      return {
        escolaId: interacao.escola_id,
        contatoId: interacao.contato_id,
        inscricaoId: null,
        caixaId: interacao.caixa_envio_id,
        escolaNome: escolaData?.nome || 'Escola',
        contatoNome: contatoData?.nome || null,
        contatoEmail: contatoData?.email || msg.remetenteEmail,
        ultimoEnvioAssunto: interacao.assunto,
      };
    }
  }

  // 3. Sender e-mail matching contato que recebeu e-mail nos últimos 45 dias
  const emailRemetente = msg.remetenteEmail.trim().toLowerCase();
  if (emailRemetente) {
    const dataLimite = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();

    const { data: contato } = await supabaseAdmin
      .from('contatos')
      .select('id, escola_id, nome, email, escolas(nome)')
      .eq('email', emailRemetente)
      .limit(1)
      .maybeSingle();

    if (contato) {
      // Verifica se houve interação recente ou inscrição
      const { data: interacaoRecente } = await supabaseAdmin
        .from('interacoes')
        .select('id, assunto, caixa_envio_id, criado_em')
        .eq('contato_id', contato.id)
        .gte('criado_em', dataLimite)
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: inscricaoRecente } = await supabaseAdmin
        .from('inscricoes')
        .select('id, caixa_envio_id, status')
        .eq('contato_id', contato.id)
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (interacaoRecente || inscricaoRecente) {
        const escolaData = contato.escolas as unknown as { nome: string } | null;
        return {
          escolaId: contato.escola_id,
          contatoId: contato.id,
          inscricaoId: inscricaoRecente?.id || null,
          caixaId: interacaoRecente?.caixa_envio_id || inscricaoRecente?.caixa_envio_id || null,
          escolaNome: escolaData?.nome || 'Escola',
          contatoNome: contato.nome,
          contatoEmail: contato.email,
          ultimoEnvioAssunto: interacaoRecente?.assunto || null,
        };
      }
    }
  }

  return null;
}

/**
 * Processa uma única mensagem do Gmail e aplica as regras de negócio completas da Etapa 11.
 */
export async function processarMensagemRecebida(
  msgRaw: unknown,
  caixa: CaixaEnvio
): Promise<{ processada: boolean; motivo?: string; classificacao?: ClassificacaoResposta }> {
  const dados = extrairDadosMensagemGmail(msgRaw as GmailMessagePayload);

  // 1. Ignora se for enviada por nós mesmos
  if (dados.isEnviadoPorMim || dados.remetenteEmail.toLowerCase() === caixa.email.toLowerCase()) {
    return { processada: false, motivo: 'enviada_pela_propria_caixa' };
  }

  // 2. Idempotência: verifica se já foi registrada
  if (dados.provedorMessageId) {
    const { data: existente } = await supabaseAdmin
      .from('respostas')
      .select('id')
      .eq('provedor_message_id', dados.provedorMessageId)
      .limit(1)
      .maybeSingle();

    if (existente) {
      return { processada: false, motivo: 'duplicada' };
    }
  }

  // 3. Detecção de Bounce
  const analiseBounce = detectarBounce(dados);
  if (analiseBounce.isBounce) {
    const emailFalho = analiseBounce.emailFalho || dados.remetenteEmail.toLowerCase();

    // Localiza o contato correspondente
    const { data: contato } = await supabaseAdmin
      .from('contatos')
      .select('id, escola_id, escolas(id, nome)')
      .eq('email', emailFalho)
      .limit(1)
      .maybeSingle();

    if (contato) {
      const escolaId = contato.escola_id;

      // a) Marca contato como inválido
      await supabaseAdmin
        .from('contatos')
        .update({ email_status: 'invalido' })
        .eq('id', contato.id);

      // b) Cancela inscrições ativas desse contato com status 'bounce'
      const { data: inscricoesCanceladas } = await supabaseAdmin
        .from('inscricoes')
        .update({
          status: 'bounce',
          motivo_fim: 'E-mail retornou bounce / falha de entrega',
          atualizado_em: new Date().toISOString(),
        })
        .eq('contato_id', contato.id)
        .in('status', ['ativa', 'pausada'])
        .select('id');

      // Descarta envios pendentes desse contato
      await supabaseAdmin
        .from('fila_envios')
        .update({ status: 'descartado', erro: 'E-mail retornou bounce' })
        .eq('contato_id', contato.id)
        .in('status', ['aguardando_aprovacao', 'aprovado']);

      // c) Registra interação de bounce
      const { data: interacaoBounce } = await supabaseAdmin
        .from('interacoes')
        .insert({
          escola_id: escolaId,
          contato_id: contato.id,
          caixa_envio_id: caixa.id,
          tipo: 'email_bounce',
          assunto: dados.assunto,
          conteudo: dados.corpoTexto.slice(0, 1500),
          provedor_message_id: dados.provedorMessageId,
          provedor_thread_id: dados.provedorThreadId,
          rfc_message_id: dados.rfcMessageId,
          metadata: {
            email_falho: emailFalho,
            inReplyTo: dados.inReplyTo,
          },
        })
        .select('id')
        .single();

      // d) Salva na tabela respostas
      await supabaseAdmin.from('respostas').insert({
        interacao_id: interacaoBounce?.id || null,
        inscricao_id: inscricoesCanceladas?.[0]?.id || null,
        escola_id: escolaId,
        contato_id: contato.id,
        caixa_envio_id: caixa.id,
        de_email: dados.remetenteEmail,
        assunto: dados.assunto,
        corpo_texto: dados.corpoTexto.slice(0, 3000),
        recebido_em: dados.recebidoEm,
        provedor_message_id: dados.provedorMessageId,
        provedor_thread_id: dados.provedorThreadId,
        classificacao: 'bounce',
        confianca: 1.0,
        justificativa: `Falha de entrega identificada para o endereço ${emailFalho}`,
        tratada: true,
      });

      // e) Verifica se a escola tem outro contato com pode_enviar = true
      const { data: outrosContatos } = await supabaseAdmin
        .from('contatos')
        .select('id, nome, email, pode_enviar')
        .eq('escola_id', escolaId)
        .neq('id', contato.id)
        .eq('pode_enviar', true)
        .limit(1);

      if (outrosContatos && outrosContatos.length > 0) {
        const outro = outrosContatos[0];
        // Enfileira sugestão na fila ou cria lembrete para inscrever o outro contato
        await supabaseAdmin.from('lembretes').insert({
          escola_id: escolaId,
          contato_id: outro.id,
          data: new Date().toISOString().split('T')[0],
          texto: `Bounce no contato ${emailFalho}. Sugestão: iniciar sequência com ${outro.nome || 'outro decisor'} (${outro.email}).`,
          concluido: false,
        });
      }

      return { processada: true, classificacao: 'bounce' };
    }

    return { processada: false, motivo: 'bounce_sem_contato_correspondente' };
  }

  // 4. Casar com o Funil do CRM
  const leadCasado = await casarComFunil(dados);
  if (!leadCasado) {
    return { processada: false, motivo: 'mensagem_fora_do_funil' };
  }

  // 5. Detecção de Resposta Automática
  const autoReply = detectarRespostaAutomatica(dados);
  if (autoReply.isAutoReply) {
    // a) NÃO cancela a sequência; apenas adia o próximo envio
    const novaDataEnvio = calcularDataEnvioAposAusencia(autoReply.dataRetorno);

    if (leadCasado.inscricaoId) {
      await supabaseAdmin
        .from('inscricoes')
        .update({
          proximo_envio_em: novaDataEnvio,
          atualizado_em: new Date().toISOString(),
        })
        .eq('id', leadCasado.inscricaoId);

      // Atualiza envios futuros agendados na fila
      await supabaseAdmin
        .from('fila_envios')
        .update({ agendado_para: novaDataEnvio })
        .eq('inscricao_id', leadCasado.inscricaoId)
        .in('status', ['aguardando_aprovacao', 'aprovado']);
    }

    // b) Registra interação
    const { data: interacaoAuto } = await supabaseAdmin
      .from('interacoes')
      .insert({
        escola_id: leadCasado.escolaId,
        contato_id: leadCasado.contatoId,
        caixa_envio_id: caixa.id,
        tipo: 'email_resposta_automatica',
        assunto: dados.assunto,
        conteudo: dados.corpoTexto.slice(0, 1500),
        provedor_message_id: dados.provedorMessageId,
        provedor_thread_id: dados.provedorThreadId,
        rfc_message_id: dados.rfcMessageId,
        metadata: {
          dataRetorno: autoReply.dataRetorno,
          adiado_para: novaDataEnvio,
        },
      })
      .select('id')
      .single();

    // c) Salva na tabela respostas
    await supabaseAdmin.from('respostas').insert({
      interacao_id: interacaoAuto?.id || null,
      inscricao_id: leadCasado.inscricaoId,
      escola_id: leadCasado.escolaId,
      contato_id: leadCasado.contatoId,
      caixa_envio_id: caixa.id,
      de_email: dados.remetenteEmail,
      assunto: dados.assunto,
      corpo_texto: dados.corpoTexto.slice(0, 3000),
      recebido_em: dados.recebidoEm,
      provedor_message_id: dados.provedorMessageId,
      provedor_thread_id: dados.provedorThreadId,
      classificacao: 'resposta_automatica',
      confianca: 1.0,
      justificativa: autoReply.dataRetorno
        ? `Ausência automática detectada com retorno previsto para ${autoReply.dataRetorno}`
        : 'Resposta automática de ausência/férias detectada',
      data_retorno: autoReply.dataRetorno || null,
      tratada: true,
    });

    return { processada: true, classificacao: 'resposta_automatica' };
  }

  // 6. Resposta Humana Real -> Classificação com Claude
  const textoLimpo = extrairTextoNovoResposta(dados.corpoTexto);

  // Busca histórico recente para contexto (última interação enviada)
  const { data: ultimasInteracoes } = await supabaseAdmin
    .from('interacoes')
    .select('assunto, conteudo, criado_em')
    .eq('escola_id', leadCasado.escolaId)
    .order('criado_em', { ascending: false })
    .limit(3);

  const historicoTexto = ultimasInteracoes
    ?.map((i) => `Assunto: ${i.assunto}\n${i.conteudo?.slice(0, 300)}`)
    .join('\n---\n');

  const resultadoClassificacao = await classificarRespostaComClaude({
    textoResposta: textoLimpo || dados.corpoTexto.slice(0, 1000),
    historicoContexto: historicoTexto,
    contatoNome: leadCasado.contatoNome,
    escolaNome: leadCasado.escolaNome,
  });

  const classificacao = resultadoClassificacao.classificacao;

  // 7. Para a sequência de e-mails imediatamente
  if (leadCasado.inscricaoId) {
    const statusInscricaoMap: Record<ClassificacaoResposta, string> = {
      interessado: 'respondida',
      mais_informacoes: 'respondida',
      agora_nao: 'respondida',
      indicou_outra_pessoa: 'respondida',
      sem_interesse: 'cancelada',
      descadastro: 'descadastrada',
      outro: 'pausada',
      resposta_automatica: 'ativa',
      bounce: 'bounce',
    };

    const novoStatusInscricao = statusInscricaoMap[classificacao] || 'respondida';

    await supabaseAdmin
      .from('inscricoes')
      .update({
        status: novoStatusInscricao,
        motivo_fim: `Resposta recebida: ${classificacao}`,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', leadCasado.inscricaoId);

    // Descarta toques futuros que estavam pendentes na fila
    await supabaseAdmin
      .from('fila_envios')
      .update({
        status: 'descartado',
        erro: `Cancelado devido à resposta recebida (${classificacao})`,
      })
      .eq('inscricao_id', leadCasado.inscricaoId)
      .in('status', ['aguardando_aprovacao', 'aprovado']);
  }

  // 8. Atualiza o status do funil da Escola
  const statusFunilMap: Partial<Record<ClassificacaoResposta, string>> = {
    interessado: 'respondido',
    mais_informacoes: 'respondido',
    agora_nao: 'respondido',
    indicou_outra_pessoa: 'respondido',
    sem_interesse: 'sem_interesse',
    descadastro: 'descadastrado',
  };

  const novoStatusFunil = statusFunilMap[classificacao];
  if (novoStatusFunil) {
    await supabaseAdmin
      .from('escolas')
      .update({ status_funil: novoStatusFunil, atualizado_em: new Date().toISOString() })
      .eq('id', leadCasado.escolaId);
  }

  // 9. Registra interação de resposta
  const { data: interacaoResposta } = await supabaseAdmin
    .from('interacoes')
    .insert({
      escola_id: leadCasado.escolaId,
      contato_id: leadCasado.contatoId,
      caixa_envio_id: caixa.id,
      tipo: 'email_respondido',
      assunto: dados.assunto,
      conteudo: (textoLimpo || dados.corpoTexto).slice(0, 3000),
      provedor_message_id: dados.provedorMessageId,
      provedor_thread_id: dados.provedorThreadId,
      rfc_message_id: dados.rfcMessageId,
      metadata: {
        classificacao,
        confianca: resultadoClassificacao.confianca,
        justificativa: resultadoClassificacao.justificativa,
        indicado_nome: resultadoClassificacao.indicado_nome,
        indicado_email: resultadoClassificacao.indicado_email,
        data_retorno: resultadoClassificacao.data_retorno,
      },
    })
    .select('id')
    .single();

  // 10. Ações específicas por categoria
  const rascunhoFinal = resultadoClassificacao.rascunho_resposta;

  if (classificacao === 'interessado' || classificacao === 'mais_informacoes') {
    // Insere rascunho na fila de envios com status 'aguardando_aprovacao'
    if (leadCasado.inscricaoId && rascunhoFinal) {
      const assuntoResposta = dados.assunto.toLowerCase().startsWith('re:')
        ? dados.assunto
        : `Re: ${dados.assunto}`;

      await supabaseAdmin.from('fila_envios').insert({
        inscricao_id: leadCasado.inscricaoId,
        passo_id: null,
        contato_id: leadCasado.contatoId,
        para: dados.remetenteEmail,
        assunto: assuntoResposta,
        corpo_texto: rascunhoFinal,
        corpo_html: `<div style="font-family: sans-serif; font-size: 14px; line-height: 1.6; color: #1e293b;">${rascunhoFinal.replace(/\n/g, '<br />')}</div>`,
        status: 'aguardando_aprovacao',
        agendado_para: new Date().toISOString(),
      });
    }

    // Dispara alerta por e-mail para o operador
    await enviarAvisoNovaResposta({
      escola: { id: leadCasado.escolaId, nome: leadCasado.escolaNome },
      contato: { id: leadCasado.contatoId, nome: leadCasado.contatoNome, email: leadCasado.contatoEmail },
      classificacao,
      justificativa: resultadoClassificacao.justificativa,
      corpoResposta: textoLimpo || dados.corpoTexto,
      rascunho: rascunhoFinal,
    });
  } else if (classificacao === 'agora_nao') {
    // Cria lembrete para a data indicada ou para 90 dias
    let dataLembrete = resultadoClassificacao.data_retorno;
    if (!dataLembrete) {
      const dataFutura = new Date();
      dataFutura.setDate(dataFutura.getDate() + 90);
      dataLembrete = dataFutura.toISOString().split('T')[0];
    }

    await supabaseAdmin.from('lembretes').insert({
      escola_id: leadCasado.escolaId,
      contato_id: leadCasado.contatoId,
      data: dataLembrete,
      texto: `Retomar contato com ${leadCasado.contatoNome || 'Decisor'}: ${resultadoClassificacao.justificativa || 'Pediu para falar mais adiante'}`,
      concluido: false,
    });

    // Avisa o operador
    await enviarAvisoNovaResposta({
      escola: { id: leadCasado.escolaId, nome: leadCasado.escolaNome },
      contato: { id: leadCasado.contatoId, nome: leadCasado.contatoNome, email: leadCasado.contatoEmail },
      classificacao,
      justificativa: resultadoClassificacao.justificativa,
      corpoResposta: textoLimpo || dados.corpoTexto,
      dataRetorno: dataLembrete,
      rascunho: rascunhoFinal,
    });
  } else if (classificacao === 'indicou_outra_pessoa') {
    // Cria o novo contato com fonte = 'resposta'
    if (resultadoClassificacao.indicado_email) {
      const { data: novoContato } = await supabaseAdmin
        .from('contatos')
        .insert({
          escola_id: leadCasado.escolaId,
          nome: resultadoClassificacao.indicado_nome || 'Decisor Indicado',
          email: resultadoClassificacao.indicado_email,
          cargo: `Indicado por ${leadCasado.contatoNome || leadCasado.contatoEmail}`,
          fonte: 'resposta',
          email_status: 'nao_verificado',
        })
        .select('id')
        .single();

      // Enfileira rascunho sugerido para o novo contato caso haja rascunho
      if (leadCasado.inscricaoId && rascunhoFinal) {
        await supabaseAdmin.from('fila_envios').insert({
          inscricao_id: leadCasado.inscricaoId,
          passo_id: null,
          contato_id: novoContato?.id || null,
          para: resultadoClassificacao.indicado_email,
          assunto: `Indicação de ${leadCasado.contatoNome || 'contato'} - Littera Redação`,
          corpo_texto: rascunhoFinal,
          corpo_html: `<div style="font-family: sans-serif; font-size: 14px; line-height: 1.6; color: #1e293b;">${rascunhoFinal.replace(/\n/g, '<br />')}</div>`,
          status: 'aguardando_aprovacao',
          agendado_para: new Date().toISOString(),
        });
      }
    }

    await enviarAvisoNovaResposta({
      escola: { id: leadCasado.escolaId, nome: leadCasado.escolaNome },
      contato: { id: leadCasado.contatoId, nome: leadCasado.contatoNome, email: leadCasado.contatoEmail },
      classificacao,
      justificativa: resultadoClassificacao.justificativa,
      corpoResposta: textoLimpo || dados.corpoTexto,
      indicadoNome: resultadoClassificacao.indicado_nome,
      indicadoEmail: resultadoClassificacao.indicado_email,
      rascunho: rascunhoFinal,
    });
  } else if (classificacao === 'descadastro') {
    // Insere na tabela descadastros
    await supabaseAdmin.from('descadastros').insert({
      email: dados.remetenteEmail.trim().toLowerCase(),
      motivo: 'detectado_em_resposta',
    });

    if (leadCasado.contatoId) {
      await supabaseAdmin
        .from('contatos')
        .update({ descadastrado: true })
        .eq('id', leadCasado.contatoId);
    }
  } else if (classificacao === 'outro') {
    // Notifica operador para atenção manual
    await enviarAvisoNovaResposta({
      escola: { id: leadCasado.escolaId, nome: leadCasado.escolaNome },
      contato: { id: leadCasado.contatoId, nome: leadCasado.contatoNome, email: leadCasado.contatoEmail },
      classificacao,
      justificativa: resultadoClassificacao.justificativa,
      corpoResposta: textoLimpo || dados.corpoTexto,
      rascunho: rascunhoFinal,
    });
  }

  // 11. Salva o registro em respostas
  const precisaTratamentoManual =
    classificacao === 'interessado' ||
    classificacao === 'mais_informacoes' ||
    classificacao === 'outro' ||
    classificacao === 'indicou_outra_pessoa';

  await supabaseAdmin.from('respostas').insert({
    interacao_id: interacaoResposta?.id || null,
    inscricao_id: leadCasado.inscricaoId,
    escola_id: leadCasado.escolaId,
    contato_id: leadCasado.contatoId,
    caixa_envio_id: caixa.id,
    de_email: dados.remetenteEmail,
    assunto: dados.assunto,
    corpo_texto: (textoLimpo || dados.corpoTexto).slice(0, 4000),
    recebido_em: dados.recebidoEm,
    provedor_message_id: dados.provedorMessageId,
    provedor_thread_id: dados.provedorThreadId,
    classificacao,
    confianca: resultadoClassificacao.confianca,
    justificativa: resultadoClassificacao.justificativa,
    data_retorno: resultadoClassificacao.data_retorno,
    indicado_nome: resultadoClassificacao.indicado_nome,
    indicado_email: resultadoClassificacao.indicado_email,
    rascunho_resposta: rascunhoFinal,
    tratada: !precisaTratamentoManual,
  });

  return { processada: true, classificacao };
}

/**
 * Lê novas mensagens das caixas de envio ativas via Gmail API.
 */
export async function lerRespostasDasCaixas(): Promise<{
  caixasLidas: number;
  mensagensProcessadas: number;
  erros: Array<{ caixaEmail: string; erro: string }>;
}> {
  const { data: caixas } = await supabaseAdmin
    .from('caixas_envio')
    .select('*')
    .eq('ativa', true);

  if (!caixas || caixas.length === 0) {
    return { caixasLidas: 0, mensagensProcessadas: 0, erros: [] };
  }

  let totalMensagensProcessadas = 0;
  const erros: Array<{ caixaEmail: string; erro: string }> = [];

  for (const caixa of caixas as CaixaEnvio[]) {
    try {
      const accessToken = await obterAccessTokenGoogle(caixa);
      if (!accessToken) {
        // Caixa sem token do Google conectado (por exemplo caixa SMTP ou pendente de OAuth)
        continue;
      }

      // Busca mensagens recentes recebidas
      const mensagensLista = await listarMensagensRecentesGmail(accessToken, 'in:inbox newer_than:2d', 20);

      for (const item of mensagensLista) {
        try {
          const msgDetalhada = await obterMensagemGmail(accessToken, item.id);
          const res = await processarMensagemRecebida(msgDetalhada, caixa);
          if (res.processada) {
            totalMensagensProcessadas++;
          }
        } catch (msgErr) {
          console.error(`Erro ao processar mensagem ${item.id} da caixa ${caixa.email}:`, msgErr);
        }
      }

      // Atualiza timestamp da última leitura na caixa
      await supabaseAdmin
        .from('caixas_envio')
        .update({
          ultima_leitura_em: new Date().toISOString(),
        })
        .eq('id', caixa.id);
    } catch (caixaErr) {
      const msg = caixaErr instanceof Error ? caixaErr.message : String(caixaErr);
      console.error(`Erro ao ler mensagens da caixa ${caixa.email}:`, msg);
      erros.push({ caixaEmail: caixa.email, erro: msg });
    }
  }

  return {
    caixasLidas: caixas.length,
    mensagensProcessadas: totalMensagensProcessadas,
    erros,
  };
}

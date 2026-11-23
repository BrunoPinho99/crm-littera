import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { CaixaEnvio } from '@/types/database';
import { calcularLimiteHoje } from './limites';
import { gerarTokenDescadastro } from './tokenDescadastro';
import { enviarEmailViaBrevo, BrevoEnvioResponse } from './brevo';
import { validarRegrasDeEnvio } from './validacoes';

export interface EnviarEmailParams {
  caixaId?: string;
  para: string;
  nomeDestinatario?: string | null;
  assunto: string;
  html: string;
  texto: string;
  escolaId?: string | null;
  contatoId?: string | null;
  emRespostaA?: {
    threadId?: string | null;
    rfcMessageId?: string | null;
  };
  isTeste?: boolean;
}

export interface EnviarEmailResult {
  sucesso: boolean;
  provedorMessageId: string;
  rfcMessageId: string;
  provedorThreadId: string;
  caixaEmail: string;
}

/**
 * Orquestrador transacional de envio de e-mails via Brevo API:
 * 1. Valida caixa e limites de aquecimento diários.
 * 2. Bloqueia envio se contato/escola estiverem descadastrados ou sem interesse.
 * 3. Valida elegibilidade do e-mail com regras estritas (pode_enviar).
 * 4. Monta headers e corpo com identificação institucional e link One-Click / Web de descadastro.
 * 5. Dispara via Brevo e trata token expirado desativando a caixa.
 * 6. Incrementa contadores e grava interação com IDs RFC e Brevo.
 */
export async function enviarEmail(params: EnviarEmailParams): Promise<EnviarEmailResult> {
  const {
    caixaId,
    para,
    nomeDestinatario,
    assunto,
    html,
    texto,
    escolaId,
    contatoId,
    emRespostaA,
    isTeste = false,
  } = params;

  const emailDestino = para.trim().toLowerCase();

  // 1. Obter caixa de envio
  let query = supabaseAdmin.from('caixas_envio').select('*');
  if (caixaId) {
    query = query.eq('id', caixaId);
  } else {
    query = query.eq('ativo', true).order('criado_em', { ascending: true }).limit(1);
  }

  const { data: caixas, error: caixaErr } = await query;
  if (caixaErr || !caixas || caixas.length === 0) {
    throw new Error('Nenhuma caixa de envio ativa encontrada para realizar o disparo.');
  }

  const caixa = caixas[0] as CaixaEnvio;
  const limite = calcularLimiteHoje(caixa, new Date());

  let destinatarioNaListaDescadastro = false;
  let contatoDescadastrado = false;
  let contatoEmailStatus: string | null | undefined = undefined;
  let escolaStatusFunil: string | null | undefined = undefined;

  // 2. Coletar dados de bloqueio para destinatários comerciais
  if (!isTeste) {
    const { data: descadastroExistente } = await supabaseAdmin
      .from('descadastros')
      .select('email')
      .eq('email', emailDestino)
      .maybeSingle();

    if (descadastroExistente) {
      destinatarioNaListaDescadastro = true;
    }

    if (contatoId) {
      const { data: contato } = await supabaseAdmin
        .from('contatos')
        .select('id, descadastrado, email_status')
        .eq('id', contatoId)
        .maybeSingle();

      if (contato) {
        contatoDescadastrado = Boolean(contato.descadastrado);
        contatoEmailStatus = contato.email_status;
      }
    }

    if (escolaId) {
      const { data: escola } = await supabaseAdmin
        .from('escolas')
        .select('id, status_funil, email_geral_status')
        .eq('id', escolaId)
        .maybeSingle();

      if (escola) {
        escolaStatusFunil = escola.status_funil;
      }
    }
  }

  // 3. Executar validação centralizada de regras de envio
  const validacao = validarRegrasDeEnvio({
    caixa: { ativo: caixa.ativo, email: caixa.email },
    limite: {
      podeEnviar: limite.podeEnviar,
      enviadosHojeEfetivo: limite.enviadosHojeEfetivo,
      limiteHoje: limite.limiteHoje,
    },
    isTeste,
    destinatarioNaListaDescadastro,
    contatoDescadastrado,
    contatoEmailStatus,
    escolaStatusFunil,
  });

  if (!validacao.permitido) {
    throw new Error(validacao.motivoBloqueio || 'Envio de e-mail bloqueado por regras de governança.');
  }

  // 4. Gerar Token e URL de Descadastro
  const token = gerarTokenDescadastro({
    email: emailDestino,
    escolaId: escolaId || null,
    contatoId: contatoId || null,
  });

  const appUrl = (process.env.APP_URL || 'https://littera.app.br').replace(/\/$/, '');
  const unsubscribeUrl = `${appUrl}/descadastro?t=${encodeURIComponent(token)}`;

  // 5. Enviar via Brevo API
  let brevoRes: BrevoEnvioResponse;
  try {
    brevoRes = await enviarEmailViaBrevo({
      remetente: {
        name: caixa.nome_remetente,
        email: caixa.email,
      },
      destinatario: {
        email: emailDestino,
        name: nomeDestinatario || undefined,
      },
      assunto,
      conteudoHtml: html,
      conteudoTexto: texto,
      unsubscribeUrl,
      assinaturaHtml: caixa.assinatura_html,
      inReplyTo: emRespostaA?.rfcMessageId,
      references: emRespostaA?.rfcMessageId,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    // Se chave for inválida ou revogada, desativa a caixa para proteger a operação
    if (errorMsg.includes('Erro de autenticação Brevo API')) {
      await supabaseAdmin
        .from('caixas_envio')
        .update({
          ativo: false,
        })
        .eq('id', caixa.id);
    }

    throw new Error(`Falha no envio de e-mail via Brevo: ${errorMsg}`);
  }

  // 6. Atualizar contadores na tabela caixas_envio (apenas para envios de prospecção, não testes/notificações)
  if (!isTeste) {
    const novoEnviadosHoje = limite.deveResetarContador ? 1 : (caixa.enviados_hoje || 0) + 1;
    await supabaseAdmin
      .from('caixas_envio')
      .update({
        enviados_hoje: novoEnviadosHoje,
        data_contador: limite.dataAtualStr,
      })
      .eq('id', caixa.id);
  }

  // 7. Definir provedor_thread_id
  const provedorThreadId = emRespostaA?.threadId || brevoRes.rfcMessageId;

  // 8. Gravar interação
  await supabaseAdmin.from('interacoes').insert({
    escola_id: escolaId || null,
    contato_id: contatoId || null,
    caixa_envio_id: caixa.id,
    tipo: 'email_enviado',
    assunto,
    conteudo: texto,
    provedor_message_id: brevoRes.provedorMessageId,
    provedor_thread_id: provedorThreadId,
    rfc_message_id: brevoRes.rfcMessageId,
    metadata: {
      para: emailDestino,
      nomeDestinatario: nomeDestinatario || null,
      isTeste,
      dataContador: limite.dataAtualStr,
      provedor: 'brevo',
    },
  });

  // 9. Atualizar última interação na escola se aplicável
  if (escolaId) {
    await supabaseAdmin
      .from('escolas')
      .update({
        ultima_interacao: new Date().toISOString(),
      })
      .eq('id', escolaId);
  }

  return {
    sucesso: true,
    provedorMessageId: brevoRes.provedorMessageId,
    rfcMessageId: brevoRes.rfcMessageId,
    provedorThreadId,
    caixaEmail: caixa.email,
  };
}

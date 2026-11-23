'use server';

import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { CaixaEnvio } from '@/types/database';
import { calcularLimiteHoje, LimiteCalculado } from '@/lib/envio/limites';
import { enviarEmail } from '@/lib/envio/enviarEmail';
import { revalidatePath } from 'next/cache';

export interface CaixaEnvioComLimite extends CaixaEnvio {
  limiteCalculado: LimiteCalculado;
}

export async function getCaixasEnvioAction(): Promise<{
  caixas: CaixaEnvioComLimite[];
  userEmail: string | null;
}> {
  const user = await requireUser();

  const { data, error } = await supabaseAdmin
    .from('caixas_envio')
    .select('*')
    .order('criado_em', { ascending: true });

  if (error || !data) {
    console.error('Erro ao buscar caixas de envio:', error);
    return { caixas: [], userEmail: user.email || null };
  }

  const caixas = data.map((caixa) => ({
    ...(caixa as CaixaEnvio),
    limiteCalculado: calcularLimiteHoje(caixa as CaixaEnvio, new Date()),
  }));

  return { caixas, userEmail: user.email || null };
}

export async function salvarCaixaEnvioAction(
  caixaId: string,
  dados: {
    nome_remetente: string;
    ativo: boolean;
    assinatura_html?: string | null;
    limite_diario_inicial: number;
    incremento_semanal: number;
    limite_diario_maximo: number;
    aquecimento_inicio: string;
  }
): Promise<{ success: boolean; error?: string }> {
  await requireUser();

  const { error } = await supabaseAdmin
    .from('caixas_envio')
    .update({
      nome_remetente: dados.nome_remetente.trim(),
      ativo: dados.ativo,
      assinatura_html: dados.assinatura_html || null,
      limite_diario_inicial: Number(dados.limite_diario_inicial),
      incremento_semanal: Number(dados.incremento_semanal),
      limite_diario_maximo: Number(dados.limite_diario_maximo),
      aquecimento_inicio: dados.aquecimento_inicio,
    })
    .eq('id', caixaId);

  if (error) {
    console.error('Erro ao salvar caixa de envio:', error);
    return { success: false, error: 'Falha ao salvar as configurações da caixa.' };
  }

  revalidatePath('/configuracoes/email');
  return { success: true };
}

export async function enviarEmailTesteAction(params: {
  caixaId?: string;
  emailDestino: string;
}): Promise<{
  success: boolean;
  provedorMessageId?: string;
  rfcMessageId?: string;
  provedorThreadId?: string;
  caixaEmail?: string;
  error?: string;
}> {
  const user = await requireUser();
  const destino = (params.emailDestino || user.email || '').trim().toLowerCase();

  if (!destino || !destino.includes('@')) {
    return { success: false, error: 'E-mail de destino inválido para o teste.' };
  }

  try {
    const res = await enviarEmail({
      caixaId: params.caixaId,
      para: destino,
      nomeDestinatario: 'Administrador Littera',
      assunto: 'Teste de Entregabilidade: SPF, DKIM e DMARC — Littera CRM',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; max-width: 600px; padding: 20px; line-height: 1.6;">
          <h2 style="color: #0f172a; margin-top: 0;">Teste de Entregabilidade e Infraestrutura de Envio</h2>
          <p>Olá! Este é um e-mail de teste disparado pelo painel de configurações do <strong>Littera CRM</strong> via <strong>Brevo API</strong> utilizando o domínio dedicado de prospecção.</p>
          
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px; margin: 24px 0;">
            <h4 style="margin: 0 0 10px 0; color: #334155; font-size: 14px;">Como conferir o alinhamento SPF, DKIM e DMARC:</h4>
            <ol style="margin: 0; padding-left: 20px; font-size: 13px; color: #475569; line-height: 1.7;">
              <li>Abra esta mensagem no <strong>Gmail</strong>.</li>
              <li>Clique no menu de <strong>três pontinhos</strong> (Mais opções) no canto superior direito.</li>
              <li>Clique em <strong>"Mostrar original"</strong>.</li>
              <li>Verifique o cabeçalho de autenticação:
                <ul style="margin-top: 4px; padding-left: 18px;">
                  <li><strong>SPF:</strong> PASS (com IP do Brevo)</li>
                  <li><strong>DKIM:</strong> PASS (com domínio grupolittera.com.br)</li>
                  <li><strong>DMARC:</strong> PASS</li>
                </ul>
              </li>
            </ol>
          </div>

          <p style="font-size: 13px; color: #64748b;">
            Os identificadores desta mensagem foram registrados na tabela <code>interacoes</code> do CRM.
          </p>
        </div>
      `,
      texto: `Teste de Entregabilidade e Infraestrutura de Envio\n\nEste é um e-mail de teste disparado pelo painel do Littera CRM via Brevo API.\n\nPara conferir SPF, DKIM e DMARC no Gmail:\n1. Clique nos três pontinhos e em 'Mostrar original'.\n2. Verifique se SPF, DKIM e DMARC exibem PASS.`,
      isTeste: true,
    });

    revalidatePath('/configuracoes/email');

    return {
      success: true,
      provedorMessageId: res.provedorMessageId,
      rfcMessageId: res.rfcMessageId,
      provedorThreadId: res.provedorThreadId,
      caixaEmail: res.caixaEmail,
    };
  } catch (err: unknown) {
    console.error('Erro ao disparar e-mail de teste:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Falha desconhecida ao enviar e-mail de teste.',
    };
  }
}

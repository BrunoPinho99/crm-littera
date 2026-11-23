import { enviarEmail } from '@/lib/envio/enviarEmail';
import { ClassificacaoResposta } from '@/types/database';

export interface ParametrosAvisoResposta {
  escola: { id: string; nome: string };
  contato: { id?: string | null; nome?: string | null; email: string };
  classificacao: ClassificacaoResposta;
  justificativa?: string | null;
  corpoResposta: string;
  rascunho?: string | null;
  indicadoNome?: string | null;
  indicadoEmail?: string | null;
  dataRetorno?: string | null;
}

export async function enviarAvisoNovaResposta(params: ParametrosAvisoResposta): Promise<boolean> {
  const destinatario = process.env.NOTIFICAR_EMAIL || 'bruno@grupolittera.com.br';
  const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const linkLead = `${baseUrl}/?escola=${params.escola.id}`;

  const rotuloClassificacao: Record<ClassificacaoResposta, string> = {
    interessado: '🔥 Interessado (Quer Reunião)',
    mais_informacoes: 'ℹ️ Pediu Mais Informações',
    agora_nao: '⏳ Agora Não (Retorno Futuro)',
    indicou_outra_pessoa: '👤 Indicou Outra Pessoa',
    sem_interesse: '🚫 Sem Interesse',
    descadastro: '🛑 Pediu Descadastro',
    resposta_automatica: '🤖 Resposta Automática',
    bounce: '⚠️ Bounce / E-mail Inválido',
    outro: '❓ Outro (Requer Atenção)',
  };

  const assunto = `[Littera CRM] Nova resposta de ${params.escola.nome} (${params.classificacao})`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.5;">
      <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 20px;">
        <h2 style="margin-top: 0; color: #0f172a; font-size: 18px; border-bottom: 2px solid #3b82f6; padding-bottom: 8px;">
          Nova Resposta Recebida
        </h2>
        
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 14px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; width: 120px;"><strong>Escola:</strong></td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${params.escola.nome}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Contato:</strong></td>
            <td style="padding: 6px 0; color: #0f172a;">${params.contato.nome || 'Decisor'} (${params.contato.email})</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Classificação:</strong></td>
            <td style="padding: 6px 0; color: #1d4ed8; font-weight: bold;">${rotuloClassificacao[params.classificacao] || params.classificacao}</td>
          </tr>
          ${params.dataRetorno ? `
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Data de Retorno:</strong></td>
            <td style="padding: 6px 0; color: #d97706; font-weight: 600;">${params.dataRetorno}</td>
          </tr>` : ''}
          ${params.indicadoEmail ? `
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Indicado:</strong></td>
            <td style="padding: 6px 0; color: #0f172a;">${params.indicadoNome ? `${params.indicadoNome} &lt;${params.indicadoEmail}&gt;` : params.indicadoEmail}</td>
          </tr>` : ''}
        </table>

        ${params.justificativa ? `
        <div style="background-color: #ffffff; border-left: 3px solid #3b82f6; padding: 10px 14px; margin-bottom: 16px; font-size: 13px; color: #334155;">
          <strong>Análise da IA:</strong> ${params.justificativa}
        </div>` : ''}

        <div style="margin-top: 15px;">
          <strong style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b;">Mensagem Recebida:</strong>
          <div style="background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; margin-top: 6px; font-size: 14px; white-space: pre-wrap; color: #1e293b;">
${params.corpoResposta}
          </div>
        </div>

        ${params.rascunho ? `
        <div style="margin-top: 20px;">
          <strong style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #15803d;">Sugestão de Resposta (Pronta para Enviar):</strong>
          <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 12px; margin-top: 6px; font-size: 14px; white-space: pre-wrap; color: #14532d;">
${params.rascunho}
          </div>
        </div>` : ''}

        <div style="margin-top: 25px; text-align: center;">
          <a href="${linkLead}" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 10px 20px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 6px;">
            Ver Lead no CRM Littera →
          </a>
        </div>
      </div>
      <p style="font-size: 12px; color: #94a3b8; text-align: center;">
        Este é um alerta automático do Littera CRM referente à detecção de respostas da caixa de envio.
      </p>
    </div>
  `;

  const texto = `
NOVA RESPOSTA DETECTADA - CRM LITTERA
=====================================
Escola: ${params.escola.nome}
Contato: ${params.contato.nome || 'Decisor'} (${params.contato.email})
Classificação: ${rotuloClassificacao[params.classificacao] || params.classificacao}
${params.dataRetorno ? `Data Retorno: ${params.dataRetorno}\n` : ''}${params.indicadoEmail ? `Indicado: ${params.indicadoNome || ''} <${params.indicadoEmail}>\n` : ''}
${params.justificativa ? `Justificativa IA: ${params.justificativa}\n` : ''}

--- MENSAGEM RECEBIDA ---
${params.corpoResposta}

${params.rascunho ? `--- SUGESTÃO DE RESPOSTA ---\n${params.rascunho}\n` : ''}
Abrir no CRM: ${linkLead}
  `.trim();

  try {
    await enviarEmail({
      para: destinatario,
      assunto,
      html,
      texto,
      isTeste: true,
      escolaId: params.escola.id,
      contatoId: params.contato.id,
    });
    return true;
  } catch (err) {
    console.error('Falha ao enviar e-mail de alerta de nova resposta:', err);
    return false;
  }
}

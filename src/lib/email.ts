import nodemailer from 'nodemailer';

export const GMAIL_USER = process.env.GMAIL_USER || 'bruno.pinho.brasilia@gmail.com';
export const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || '';

export function getEmailTransporter() {
  if (!GMAIL_APP_PASSWORD) {
    return null;
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_APP_PASSWORD.replace(/\s+/g, ''), // remove espaços comuns em senhas de app
    },
  });
}

export function generateLeadEmailContent(lead: {
  nome_escola: string;
  nome_decisor?: string | null;
}) {
  const schoolName = lead.nome_escola;
  const recipientName = lead.nome_decisor?.trim() ? lead.nome_decisor : 'Equipe Pedagógica / Direção';

  const subject = `Inovação Pedagógica & Gestão Digital: Apresentação para ${schoolName}`;

  const text = `Olá, ${recipientName},

Espero que este e-mail o encontre bem.

Acompanho a trajetória de excelência e dedicação do ${schoolName} em Brasília e gostaria de apresentar como nossa plataforma educacional tem auxiliado instituições a otimizar o engajamento dos alunos e simplificar rotinas acadêmicas.

Gostaria de agendar uma breve conversa de 15 minutos esta semana para demonstrar como escolas parceiras aumentaram a retenção e facilitaram a comunicação com as famílias.

Qual seria o melhor dia e horário para conversarmos?

Atenciosamente,
Bruno Pinho
Littera Educacional
bruno.pinho.brasilia@gmail.com | Brasília - DF`;

  const html = `
    <div style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.6; max-width: 600px;">
      <p>Olá, <strong>${recipientName}</strong>,</p>
      <p>Espero que este e-mail o encontre bem.</p>
      <p>
        Acompanho a trajetória de excelência e dedicação do <strong>${schoolName}</strong> em Brasília e gostaria de apresentar como nossa plataforma educacional tem auxiliado instituições a otimizar o engajamento dos alunos e simplificar rotinas acadêmicas.
      </p>
      <p>
        Gostaria de agendar uma breve conversa de <strong>15 minutos</strong> esta semana para demonstrar como escolas parceiras aumentaram a retenção e facilitaram a comunicação com as famílias.
      </p>
      <p>Qual seria o melhor dia e horário para conversarmos?</p>
      <br />
      <hr style="border: 0; border-top: 1px solid #e2e8f0;" />
      <p style="margin-top: 16px; font-size: 14px; color: #475569;">
        <strong>Bruno Pinho</strong><br />
        <span style="color: #2563eb; font-weight: 600;">Littera Educacional</span><br />
        <a href="mailto:${GMAIL_USER}" style="color: #64748b; text-decoration: none;">${GMAIL_USER}</a> | Brasília - DF
      </p>
    </div>
  `;

  return { subject, text, html };
}

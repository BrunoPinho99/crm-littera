/**
 * Gerador de conteúdo de e-mail comercial para leads escolares.
 * NOTA: O copywriting completo e sequências multietapas serão aprofundados na Etapa 10.
 */
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
Equipe Littera Educacional
Brasília - DF`;

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
        <strong>Littera Educacional</strong><br />
        <span style="color: #2563eb; font-weight: 600;">Relacionamento Institucional</span><br />
        Brasília - DF
      </p>
    </div>
  `;

  return { subject, text, html };
}

export function formatWhatsAppNumber(phone: string): string {
  // Remove todos os caracteres não numéricos
  const clean = phone.replace(/\D/g, '');
  if (!clean) return '';

  // Se já tiver DDI (55)
  if (clean.startsWith('55') && clean.length >= 12) {
    return clean;
  }

  // Se for DDD (ex: 61999999999 ou 6133333333)
  if (clean.length === 10 || clean.length === 11) {
    return `55${clean}`;
  }

  // Se for número local sem DDD, assume Brasília (61)
  if (clean.length === 8 || clean.length === 9) {
    return `5561${clean}`;
  }

  return clean;
}

export function generateWhatsAppMessage(lead: {
  nome?: string;
  nome_escola?: string;
  nome_decisor?: string | null;
  contatos?: Array<{ nome?: string | null; principal?: boolean }>;
}): string {
  const principal = lead.contatos?.find((c) => c.principal);
  const recipientName =
    principal?.nome?.trim() ||
    lead.nome_decisor?.trim() ||
    'Equipe Diretiva';

  const schoolName = lead.nome || lead.nome_escola || 'sua instituição';

  return (
    `Olá, ${recipientName}! Tudo bem? ` +
    `Aqui é o Bruno da Littera Educacional. ` +
    `Estava acompanhando o trabalho de excelência do ${schoolName} em Brasília e gostaria de compartilhar como estamos ajudando instituições de ensino a otimizar a gestão pedagógica e engajamento das famílias. ` +
    `Você teria 10 minutos esta semana para um breve alinhamento online?`
  );
}

export function getWhatsAppUrl(phone: string, message: string): string {
  const formattedPhone = formatWhatsAppNumber(phone);
  const encodedText = encodeURIComponent(message);
  return `https://wa.me/${formattedPhone}?text=${encodedText}`;
}

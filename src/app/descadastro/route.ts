import { NextRequest, NextResponse } from 'next/server';
import { validarTokenDescadastro } from '@/lib/envio/tokenDescadastro';
import { supabaseAdmin } from '@/lib/supabase/admin';

function maskEmail(email: string): string {
  const parts = email.split('@');
  if (parts.length !== 2) return 'seu e-mail';
  const [local, domain] = parts;
  if (local.length <= 2) {
    return `${local[0] || ''}***@${domain}`;
  }
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

function renderHtmlPage(title: string, contentHtml: string, isSuccess = true): string {
  const badgeColor = isSuccess ? '#10b981' : '#ef4444';
  const badgeText = isSuccess ? 'Descadastro' : 'Aviso';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} | Littera Educacional</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8fafc;
      color: #1e293b;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }
    .card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      max-width: 480px;
      width: 100%;
      padding: 36px 32px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
      text-align: center;
    }
    .logo-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 600;
      background-color: #f1f5f9;
      color: #475569;
      margin-bottom: 20px;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: ${badgeColor};
    }
    h1 {
      font-size: 20px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 12px;
    }
    p {
      font-size: 14px;
      line-height: 1.6;
      color: #64748b;
      margin-bottom: 24px;
    }
    .btn {
      display: inline-block;
      width: 100%;
      padding: 12px 20px;
      background-color: #0f172a;
      color: #ffffff;
      font-size: 14px;
      font-weight: 600;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      text-decoration: none;
      transition: background-color 0.15s ease;
    }
    .btn:hover {
      background-color: #334155;
    }
    .footer-note {
      font-size: 11px;
      color: #94a3b8;
      margin-top: 24px;
      margin-bottom: 0;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo-badge">
      <span class="dot"></span>
      <span>${badgeText} • Littera Educacional</span>
    </div>
    <h1>${title}</h1>
    ${contentHtml}
    <p class="footer-note">Littera Educação e Tecnologia &bull; Respeito à sua privacidade</p>
  </div>
</body>
</html>`;
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('t');

  if (!token) {
    const html = renderHtmlPage(
      'Parâmetro Ausente',
      '<p>O link de descadastro não contém um token válido. Caso tenha chegado aqui por engano, pode fechar esta aba.</p>',
      false
    );
    return new NextResponse(html, {
      status: 400,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  const payload = validarTokenDescadastro(token);
  if (!payload) {
    const html = renderHtmlPage(
      'Link Inválido ou Adulterado',
      '<p>Este link de descadastro não é válido ou foi corrompido. Não se preocupe: você pode responder ao e-mail recebido pedindo o cancelamento a qualquer momento.</p>',
      false
    );
    return new NextResponse(html, {
      status: 400,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  const masked = maskEmail(payload.email);
  const actionUrl = `/descadastro?t=${encodeURIComponent(token)}`;

  const body = `
    <p>Deseja realmente remover o e-mail <strong>${masked}</strong> da nossa lista de contatos educacionais?</p>
    <form method="POST" action="${actionUrl}">
      <button type="submit" class="btn">Confirmar descadastro</button>
    </form>
  `;

  return new NextResponse(renderHtmlPage('Confirmação de Descadastro', body, true), {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('t');

  if (!token) {
    return NextResponse.json({ error: 'Token não informado.' }, { status: 400 });
  }

  const payload = validarTokenDescadastro(token);
  if (!payload) {
    return NextResponse.json({ error: 'Token inválido ou adulterado.' }, { status: 400 });
  }

  const emailDestino = payload.email.trim().toLowerCase();

  // 1. Inserir / Upsert na tabela descadastros (dispara o trigger trigger_after_insert_descadastro)
  await supabaseAdmin.from('descadastros').upsert({
    email: emailDestino,
    escola_id: payload.escolaId || null,
    contato_id: payload.contatoId || null,
    motivo: 'Solicitado pelo destinatário via link de descadastro (One-Click / Web)',
  });

  // 2. Se escolaId foi informado, verificar se restou algum contato ativo
  if (payload.escolaId) {
    const { count, error: countErr } = await supabaseAdmin
      .from('contatos')
      .select('id', { count: 'exact', head: true })
      .eq('escola_id', payload.escolaId)
      .eq('descadastrado', false);

    if (!countErr && (count === null || count === 0)) {
      await supabaseAdmin
        .from('escolas')
        .update({ status_funil: 'descadastrado' })
        .eq('id', payload.escolaId);
    }
  }

  // 3. Gravar interação de descadastro
  await supabaseAdmin.from('interacoes').insert({
    escola_id: payload.escolaId || null,
    contato_id: payload.contatoId || null,
    tipo: 'descadastro',
    assunto: 'Descadastro de e-mail (opt-out)',
    conteudo: `Destinatário ${emailDestino} solicitou descadastro com sucesso.`,
    metadata: {
      email: emailDestino,
      ip: request.headers.get('x-forwarded-for') || null,
      userAgent: request.headers.get('user-agent') || null,
    },
  });

  const acceptHeader = request.headers.get('accept') || '';
  if (acceptHeader.includes('application/json')) {
    return NextResponse.json({
      success: true,
      message: 'Pronto, você não receberá mais e-mails.',
    });
  }

  const successHtml = renderHtmlPage(
    'Descadastro Concluído',
    '<p>Pronto, você não receberá mais e-mails.</p><p style="font-size: 13px;">Seu endereço foi removido com sucesso de todas as nossas comunicações de prospecção.</p>',
    true
  );

  return new NextResponse(successHtml, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

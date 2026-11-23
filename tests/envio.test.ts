import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calcularLimiteHoje } from '../src/lib/envio/limites';
import {
  gerarTokenDescadastro,
  validarTokenDescadastro,
} from '../src/lib/envio/tokenDescadastro';
import {
  construirPayloadBrevo,
  gerarRfcMessageId,
  montarRodapeHtml,
  montarRodapeTexto,
} from '../src/lib/envio/brevo';
import { podeEnviarEmail } from '../src/lib/envio/regrasEnvio';
import { validarRegrasDeEnvio } from '../src/lib/envio/validacoes';

describe('1. Cálculo de Limites de Aquecimento (limites.ts)', () => {
  it('deve retornar limite inicial na semana 0 (mesmo dia)', () => {
    const caixa = {
      ativo: true,
      limite_diario_inicial: 10,
      incremento_semanal: 5,
      limite_diario_maximo: 50,
      aquecimento_inicio: '2026-11-23',
      enviados_hoje: 0,
      data_contador: '2026-11-23',
    };

    const res = calcularLimiteHoje(caixa, '2026-11-23');
    assert.strictEqual(res.semanas, 0);
    assert.strictEqual(res.limiteHoje, 10);
    assert.strictEqual(res.enviadosHojeEfetivo, 0);
    assert.strictEqual(res.disponivelHoje, 10);
    assert.strictEqual(res.podeEnviar, true);
    assert.strictEqual(res.deveResetarContador, false);
  });

  it('deve aplicar incremento semanal na semana 1 (7 dias após início)', () => {
    const caixa = {
      ativo: true,
      limite_diario_inicial: 10,
      incremento_semanal: 5,
      limite_diario_maximo: 50,
      aquecimento_inicio: '2026-11-16',
      enviados_hoje: 3,
      data_contador: '2026-11-23',
    };

    const res = calcularLimiteHoje(caixa, '2026-11-23');
    assert.strictEqual(res.semanas, 1);
    assert.strictEqual(res.limiteHoje, 15);
    assert.strictEqual(res.enviadosHojeEfetivo, 3);
    assert.strictEqual(res.disponivelHoje, 12);
    assert.strictEqual(res.podeEnviar, true);
  });

  it('deve aplicar incremento semanal na semana 2 (14 dias após início)', () => {
    const caixa = {
      ativo: true,
      limite_diario_inicial: 10,
      incremento_semanal: 5,
      limite_diario_maximo: 50,
      aquecimento_inicio: '2026-11-09',
      enviados_hoje: 5,
      data_contador: '2026-11-23',
    };

    const res = calcularLimiteHoje(caixa, '2026-11-23');
    assert.strictEqual(res.semanas, 2);
    assert.strictEqual(res.limiteHoje, 20);
    assert.strictEqual(res.disponivelHoje, 15);
  });

  it('deve respeitar o teto máximo de 50/dia após muitas semanas de aquecimento', () => {
    const caixa = {
      ativo: true,
      limite_diario_inicial: 10,
      incremento_semanal: 5,
      limite_diario_maximo: 50,
      aquecimento_inicio: '2026-06-01', // ~25 semanas atrás
      enviados_hoje: 20,
      data_contador: '2026-11-23',
    };

    const res = calcularLimiteHoje(caixa, '2026-11-23');
    assert.ok(res.semanas >= 10);
    assert.strictEqual(res.limiteHoje, 50, 'Deve travar no teto máximo de 50');
    assert.strictEqual(res.disponivelHoje, 30);
    assert.strictEqual(res.podeEnviar, true);
  });

  it('deve zerar limite e bloquear envios se caixa estiver inativa', () => {
    const caixa = {
      ativo: false,
      limite_diario_inicial: 10,
      incremento_semanal: 5,
      limite_diario_maximo: 50,
      aquecimento_inicio: '2026-11-23',
      enviados_hoje: 0,
      data_contador: '2026-11-23',
    };

    const res = calcularLimiteHoje(caixa, '2026-11-23');
    assert.strictEqual(res.limiteHoje, 0);
    assert.strictEqual(res.podeEnviar, false);
    assert.strictEqual(res.disponivelHoje, 0);
  });

  it('deve resetar logicamente enviados_hoje para 0 se data_contador for de outro dia', () => {
    const caixa = {
      ativo: true,
      limite_diario_inicial: 10,
      incremento_semanal: 5,
      limite_diario_maximo: 50,
      aquecimento_inicio: '2026-11-20',
      enviados_hoje: 10, // Atingiu o limite ontem
      data_contador: '2026-11-22', // Data anterior
    };

    const res = calcularLimiteHoje(caixa, '2026-11-23'); // Hoje
    assert.strictEqual(res.deveResetarContador, true);
    assert.strictEqual(res.enviadosHojeEfetivo, 0, 'Deve zerar contagem lógica no novo dia');
    assert.strictEqual(res.limiteHoje, 10);
    assert.strictEqual(res.disponivelHoje, 10);
    assert.strictEqual(res.podeEnviar, true);
  });

  it('deve bloquear quando enviadosHojeEfetivo atingir o limite de hoje', () => {
    const caixa = {
      ativo: true,
      limite_diario_inicial: 10,
      incremento_semanal: 5,
      limite_diario_maximo: 50,
      aquecimento_inicio: '2026-11-23',
      enviados_hoje: 10,
      data_contador: '2026-11-23',
    };

    const res = calcularLimiteHoje(caixa, '2026-11-23');
    assert.strictEqual(res.enviadosHojeEfetivo, 10);
    assert.strictEqual(res.disponivelHoje, 0);
    assert.strictEqual(res.podeEnviar, false);
  });
});

describe('2. Geração e Validação de Token de Descadastro (tokenDescadastro.ts)', () => {
  it('deve gerar e validar um token válido com sucesso', () => {
    const payload = {
      email: 'diretoria@colegioexemplo.com.br',
      escolaId: '550e8400-e29b-41d4-a716-446655440000',
      contatoId: '660e8400-e29b-41d4-a716-446655440000',
    };

    const token = gerarTokenDescadastro(payload);
    assert.ok(typeof token === 'string' && token.includes('.'));

    const decodificado = validarTokenDescadastro(token);
    assert.ok(decodificado !== null);
    assert.strictEqual(decodificado.email, 'diretoria@colegioexemplo.com.br');
    assert.strictEqual(decodificado.escolaId, payload.escolaId);
    assert.strictEqual(decodificado.contatoId, payload.contatoId);
  });

  it('deve rejeitar token adulterado na assinatura HMAC', () => {
    const token = gerarTokenDescadastro({
      email: 'teste@escola.com.br',
    });

    const [payloadB64, assinatura] = token.split('.');
    const assinaturaAdulterada = `${assinatura.slice(0, -2)}xx`;
    const tokenAdulterado = `${payloadB64}.${assinaturaAdulterada}`;

    const decodificado = validarTokenDescadastro(tokenAdulterado);
    assert.strictEqual(decodificado, null, 'Token com assinatura adulterada deve retornar null');
  });

  it('deve rejeitar token com payload adulterado', () => {
    const token = gerarTokenDescadastro({
      email: 'usuario1@escola.com.br',
    });

    const [, assinatura] = token.split('.');
    // Cria payload malicioso com outro email mas mesma assinatura
    const payloadAdulteradoB64 = Buffer.from(
      JSON.stringify({ email: 'hacker@escola.com.br' })
    ).toString('base64url');

    const tokenFalso = `${payloadAdulteradoB64}.${assinatura}`;
    const decodificado = validarTokenDescadastro(tokenFalso);
    assert.strictEqual(decodificado, null, 'Payload adulterado deve falhar na checagem de assinatura');
  });

  it('deve rejeitar tokens malformados ou vazios', () => {
    assert.strictEqual(validarTokenDescadastro(''), null);
    assert.strictEqual(validarTokenDescadastro('string_sem_ponto'), null);
    assert.strictEqual(validarTokenDescadastro('a.b.c'), null);
    assert.strictEqual(validarTokenDescadastro('null'), null);
  });
});

describe('3. Montagem do Payload Brevo e Cabeçalhos RFC (brevo.ts)', () => {
  it('deve construir payload com acentuação UTF-8, Message-ID e List-Unsubscribe', () => {
    const unsubscribeUrl = 'https://littera.app.br/descadastro?t=token_exemplo_123';
    const assunto = 'Apresentação Pedagógica & Gestão Digital: Colégio São Luís — Ensino Médio';

    const { payload, rfcMessageId } = construirPayloadBrevo({
      remetente: {
        name: 'Bruno - Littera',
        email: 'bruno@grupolittera.com.br',
      },
      destinatario: {
        name: 'Diretora Maria da Conceição',
        email: 'direcao@colegiosaoluis.com.br',
      },
      assunto,
      conteudoHtml: '<p>Prezada Diretora, gostaríamos de agendar uma reunião.</p>',
      conteudoTexto: 'Prezada Diretora, gostaríamos de agendar uma reunião.',
      unsubscribeUrl,
      assinaturaHtml: '<p>Atenciosamente,<br><strong>Bruno Pinho</strong></p>',
      razaoSocial: 'Littera Educação e Tecnologia LTDA',
      endereco: 'Brasília - DF, Brasil',
    });

    // Assunto com acentuação preservada
    assert.strictEqual(payload.subject, assunto);

    // Remetente e destinatário
    assert.strictEqual(payload.sender.name, 'Bruno - Littera');
    assert.strictEqual(payload.sender.email, 'bruno@grupolittera.com.br');
    assert.strictEqual(payload.to[0].email, 'direcao@colegiosaoluis.com.br');
    assert.strictEqual(payload.to[0].name, 'Diretora Maria da Conceição');

    // Cabeçalhos RFC 5322 e RFC 8058
    assert.ok(rfcMessageId.startsWith('<') && rfcMessageId.endsWith('@grupolittera.com.br>'));
    assert.strictEqual(payload.headers['Message-ID'], rfcMessageId);
    assert.strictEqual(payload.headers['List-Unsubscribe'], `<${unsubscribeUrl}>`);
    assert.strictEqual(payload.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');

    // HTML contém assinatura, razão social, endereço e link visível de descadastro
    assert.ok(payload.htmlContent.includes('Prezada Diretora'));
    assert.ok(payload.htmlContent.includes('Bruno Pinho'));
    assert.ok(payload.htmlContent.includes('Littera Educação e Tecnologia LTDA'));
    assert.ok(payload.htmlContent.includes('Brasília - DF, Brasil'));
    assert.ok(payload.htmlContent.includes(unsubscribeUrl));

    // Texto puro contém rodapé com link
    assert.ok(payload.textContent.includes(unsubscribeUrl));
    assert.ok(payload.textContent.includes('Brasília - DF, Brasil'));

    // Valida funções diretas de montagem de rodapé
    const htmlRodape = montarRodapeHtml('Littera Teste', 'Sudoeste - DF', unsubscribeUrl);
    assert.ok(htmlRodape.includes('Littera Teste'));
    const textoRodape = montarRodapeTexto('Littera Teste', 'Sudoeste - DF', unsubscribeUrl);
    assert.ok(textoRodape.includes('Sudoeste - DF'));
  });

  it('deve incluir In-Reply-To e References quando for resposta a uma mensagem anterior', () => {
    const parentRfcId = '<12345-uuid@grupolittera.com.br>';
    const { payload } = construirPayloadBrevo({
      remetente: {
        name: 'Bruno - Littera',
        email: 'bruno@grupolittera.com.br',
      },
      destinatario: {
        email: 'diretor@escola.com.br',
      },
      assunto: 'Re: Apresentação Pedagógica',
      conteudoHtml: '<p>Segue a proposta combinada.</p>',
      conteudoTexto: 'Segue a proposta combinada.',
      unsubscribeUrl: 'https://littera.app.br/descadastro?t=test',
      inReplyTo: parentRfcId,
      references: parentRfcId,
    });

    assert.strictEqual(payload.headers['In-Reply-To'], parentRfcId);
    assert.strictEqual(payload.headers['References'], parentRfcId);
  });

  it('deve gerar Message-ID no formato <uuid@dominio>', () => {
    const rfcId = gerarRfcMessageId('contato@grupolittera.com.br');
    assert.ok(rfcId.startsWith('<'));
    assert.ok(rfcId.endsWith('@grupolittera.com.br>'));
    const miolo = rfcId.slice(1, -'@grupolittera.com.br>'.length);
    assert.strictEqual(miolo.length, 36, 'UUID v4 padrão de 36 caracteres');
  });
});

describe('4. Regras de Verificação e Elegibilidade de E-mail (regrasEnvio.ts)', () => {
  it('deve permitir envio para status valido', () => {
    assert.strictEqual(podeEnviarEmail('valido'), true);
    assert.strictEqual(podeEnviarEmail('VALIDO'), true);
  });

  it('deve bloquear envio para status nao_verificado, invalido e desconhecido', () => {
    assert.strictEqual(podeEnviarEmail('nao_verificado'), false);
    assert.strictEqual(podeEnviarEmail('invalido'), false);
    assert.strictEqual(podeEnviarEmail('desconhecido'), false);
    assert.strictEqual(podeEnviarEmail(null), false);
    assert.strictEqual(podeEnviarEmail(''), false);
  });

  it('deve bloquear catch_all e arriscado na configuração padrão de alta segurança', () => {
    assert.strictEqual(podeEnviarEmail('catch_all'), false);
    assert.strictEqual(podeEnviarEmail('arriscado'), false);
  });

  it('deve permitir catch_all apenas se configurado expressamente', () => {
    assert.strictEqual(
      podeEnviarEmail('catch_all', { aceitarCatchAll: true, aceitarStatus: ['valido', 'catch_all'] }),
      true
    );
  });
});

describe('5. Bloqueios e Validações de Envio (validacoes.ts)', () => {
  const baseContext = {
    caixa: { ativo: true, email: 'bruno@grupolittera.com.br' },
    limite: { podeEnviar: true, enviadosHojeEfetivo: 2, limiteHoje: 10 },
    destinatarioNaListaDescadastro: false,
    contatoDescadastrado: false,
    contatoEmailStatus: 'valido',
    escolaStatusFunil: 'novo',
  };

  it('deve permitir envio quando todos os critérios de conformidade forem atendidos', () => {
    const res = validarRegrasDeEnvio(baseContext);
    assert.strictEqual(res.permitido, true);
    assert.strictEqual(res.motivoBloqueio, undefined);
  });

  it('deve bloquear envio se a caixa de envio estiver inativa', () => {
    const res = validarRegrasDeEnvio({
      ...baseContext,
      caixa: { ativo: false, email: 'bruno@grupolittera.com.br' },
    });
    assert.strictEqual(res.permitido, false);
    assert.ok(res.motivoBloqueio?.includes('inativa'));
  });

  it('deve bloquear envio se o limite diário de aquecimento foi atingido', () => {
    const res = validarRegrasDeEnvio({
      ...baseContext,
      limite: { podeEnviar: false, enviadosHojeEfetivo: 10, limiteHoje: 10 },
    });
    assert.strictEqual(res.permitido, false);
    assert.ok(res.motivoBloqueio?.includes('Limite diário de aquecimento atingido'));
  });

  it('deve bloquear envio se o destinatário estiver na tabela de descadastros', () => {
    const res = validarRegrasDeEnvio({
      ...baseContext,
      destinatarioNaListaDescadastro: true,
    });
    assert.strictEqual(res.permitido, false);
    assert.ok(res.motivoBloqueio?.includes('descadastro'));
  });

  it('deve bloquear envio se o contato estiver marcado como descadastrado', () => {
    const res = validarRegrasDeEnvio({
      ...baseContext,
      contatoDescadastrado: true,
    });
    assert.strictEqual(res.permitido, false);
    assert.ok(res.motivoBloqueio?.includes('contato está marcado como descadastrado'));
  });

  it('deve bloquear envio se o email_status for invalido ou nao_verificado', () => {
    const resInvalido = validarRegrasDeEnvio({
      ...baseContext,
      contatoEmailStatus: 'invalido',
    });
    assert.strictEqual(resInvalido.permitido, false);
    assert.ok(resInvalido.motivoBloqueio?.includes('Status de verificação'));

    const resNaoVerificado = validarRegrasDeEnvio({
      ...baseContext,
      contatoEmailStatus: 'nao_verificado',
    });
    assert.strictEqual(resNaoVerificado.permitido, false);
  });

  it('deve bloquear envio se o status do funil da escola for descadastrado ou sem_interesse', () => {
    const resDesc = validarRegrasDeEnvio({
      ...baseContext,
      escolaStatusFunil: 'descadastrado',
    });
    assert.strictEqual(resDesc.permitido, false);
    assert.ok(resDesc.motivoBloqueio?.includes('escola está marcada como descadastrada'));

    const resSemInteresse = validarRegrasDeEnvio({
      ...baseContext,
      escolaStatusFunil: 'sem_interesse',
    });
    assert.strictEqual(resSemInteresse.permitido, false);
    assert.ok(resSemInteresse.motivoBloqueio?.includes('sem interesse'));
  });

  it('deve permitir e-mail de teste (isTeste = true) ignorando travas de leads comerciais', () => {
    const res = validarRegrasDeEnvio({
      ...baseContext,
      isTeste: true,
      destinatarioNaListaDescadastro: true, // Ignorado pois é teste administrativo
      contatoDescadastrado: true,
      escolaStatusFunil: 'descadastrado',
    });
    assert.strictEqual(res.permitido, true);
  });
});

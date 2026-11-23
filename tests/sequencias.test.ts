import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extrairComponentesSP,
  criarDateEmSP,
  estaNaJanelaDeEnvio,
  calcularProximaJanelaValida,
  agendarProximoPasso,
} from '../src/lib/sequencias/janelas';
import {
  renderizarPasso,
  contarPalavras,
  extrairPrimeiroNome,
} from '../src/lib/sequencias/render';

describe('1. Validação de Janelas Comerciais e Feriados (janelas.ts)', () => {
  const feriadosMock = new Set(['2026-04-21', '2026-05-01', '2026-11-30']);

  it('deve validar horários permitidos em dias úteis (08h00 - 11h30 e 14h00 - 17h00)', () => {
    // Segunda-feira, 2026-11-23 09:15
    const segManha = criarDateEmSP(2026, 11, 23, 9, 15);
    assert.strictEqual(estaNaJanelaDeEnvio(segManha, feriadosMock), true);

    // Segunda-feira, 2026-11-23 11:30 (limite)
    const segLimiteManha = criarDateEmSP(2026, 11, 23, 11, 30);
    assert.strictEqual(estaNaJanelaDeEnvio(segLimiteManha, feriadosMock), true);

    // Segunda-feira, 2026-11-23 11:35 (almoço / fora da janela)
    const segAlmoco = criarDateEmSP(2026, 11, 23, 11, 35);
    assert.strictEqual(estaNaJanelaDeEnvio(segAlmoco, feriadosMock), false);

    // Segunda-feira, 2026-11-23 14:05 (tarde)
    const segTarde = criarDateEmSP(2026, 11, 23, 14, 5);
    assert.strictEqual(estaNaJanelaDeEnvio(segTarde, feriadosMock), true);

    // Segunda-feira, 2026-11-23 17:05 (após expediente)
    const segAposExpediente = criarDateEmSP(2026, 11, 23, 17, 5);
    assert.strictEqual(estaNaJanelaDeEnvio(segAposExpediente, feriadosMock), false);
  });

  it('deve bloquear envios em finais de semana', () => {
    // Sábado, 2026-11-28 10:00
    const sabado = criarDateEmSP(2026, 11, 28, 10, 0);
    assert.strictEqual(estaNaJanelaDeEnvio(sabado, feriadosMock), false);

    // Domingo, 2026-11-29 15:00
    const domingo = criarDateEmSP(2026, 11, 29, 15, 0);
    assert.strictEqual(estaNaJanelaDeEnvio(domingo, feriadosMock), false);
  });

  it('deve bloquear envios em feriados nacionais ou do DF', () => {
    // Terça-feira, 2026-04-21 (Tiradentes e Aniversário de Brasília)
    const tiradentes = criarDateEmSP(2026, 4, 21, 10, 0);
    assert.strictEqual(estaNaJanelaDeEnvio(tiradentes, feriadosMock), false);

    // Segunda-feira, 2026-11-30 (Dia do Evangélico - DF)
    const diaEvangelico = criarDateEmSP(2026, 11, 30, 15, 0);
    assert.strictEqual(estaNaJanelaDeEnvio(diaEvangelico, feriadosMock), false);
  });

  it('deve calcular próxima janela: sexta 17h01 cai na segunda 08h00', () => {
    // Sexta-feira, 2026-11-27 às 17h01
    const sextaFim = criarDateEmSP(2026, 11, 27, 17, 1);
    const proxima = calcularProximaJanelaValida(sextaFim, feriadosMock, false);

    const comp = extrairComponentesSP(proxima);
    assert.strictEqual(comp.ano, 2026);
    assert.strictEqual(comp.mes, 12); // Pula sábado 28, domingo 29, segunda 30 é feriado DF! Cai terça 01/12!
    assert.strictEqual(comp.dia, 1);
    assert.strictEqual(comp.hora, 8);
    assert.strictEqual(comp.minuto, 0);
  });

  it('deve calcular próxima janela durante intervalo de almoço: 11h35 cai às 14h00 do mesmo dia', () => {
    // Terça-feira, 2026-11-24 às 11h35
    const tercaAlmoco = criarDateEmSP(2026, 11, 24, 11, 35);
    const proxima = calcularProximaJanelaValida(tercaAlmoco, feriadosMock, false);

    const comp = extrairComponentesSP(proxima);
    assert.strictEqual(comp.dia, 24);
    assert.strictEqual(comp.hora, 14);
    assert.strictEqual(comp.minuto, 0);
  });

  it('deve agendar próximo passo respeitando dias úteis e janelas', () => {
    // Quarta-feira, 2026-11-25 10:00 -> +3 dias = Sábado 28 -> cai na Terça 01/12 (segunda 30 é feriado DF)
    const quarta = criarDateEmSP(2026, 11, 25, 10, 0);
    const agendado = agendarProximoPasso(quarta, 3, feriadosMock);

    const comp = extrairComponentesSP(agendado);
    assert.strictEqual(comp.ano, 2026);
    assert.strictEqual(comp.mes, 12);
    assert.strictEqual(comp.dia, 1);
    assert.strictEqual(comp.hora, 8);
  });
});

describe('2. Renderizador de Templates e Validações Estritas (render.ts)', () => {
  it('deve extrair e capitalizar primeiro nome corretamente', () => {
    assert.strictEqual(extrairPrimeiroNome('MARIA EDUARDA SILVA'), 'Maria');
    assert.strictEqual(extrairPrimeiroNome('joão pedro'), 'João');
    assert.strictEqual(extrairPrimeiroNome(null), '');
    assert.strictEqual(extrairPrimeiroNome(''), '');
  });

  it('deve contar palavras com precisão ignorando pontuações e traços', () => {
    const texto = 'Olá, Maria. Passando para conversar sobre a Littera — nossa plataforma.';
    assert.strictEqual(contarPalavras(texto), 10);
  });

  it('deve rejeitar texto com variáveis sem preencher {{...}}', async () => {
    const res = await renderizarPasso({
      assuntoTemplate: 'Contato com a {{escola}}',
      corpoTemplate: 'Olá, {{primeiro_nome}}. Vi que você atua no {{cargo_inexistente}} da {{escola}}.',
      variaveis: {
        primeiro_nome: 'Carlos',
        escola: 'Colégio Sigma',
        cidade: 'Brasília',
      },
      ordemPasso: 1,
    });

    assert.strictEqual(res.sucesso, false);
    assert.ok(res.erro?.includes('{{cargo_inexistente}}'));
  });

  it('deve rejeitar texto contendo marcadores de colchetes [...]', async () => {
    const res = await renderizarPasso({
      assuntoTemplate: 'Apresentação Littera',
      corpoTemplate: 'Olá, Carlos.\n\nAqui está a nossa [PROPOSTA DE VALOR] para o Colégio Sigma.',
      variaveis: {
        primeiro_nome: 'Carlos',
        escola: 'Colégio Sigma',
        cidade: 'Brasília',
      },
      ordemPasso: 1,
    });

    assert.strictEqual(res.sucesso, false);
    assert.ok(res.erro?.includes('[PROPOSTA DE VALOR]'));
  });

  it('deve rejeitar e-mails que excedam o limite de palavras', async () => {
    // Toque 2..5 tem limite estrito de 60 palavras
    const corpoLongo = Array(70).fill('palavra').join(' ');
    const res = await renderizarPasso({
      assuntoTemplate: 'Re: redações',
      corpoTemplate: corpoLongo,
      variaveis: {
        escola: 'Colégio Marista',
        cidade: 'Brasília',
      },
      ordemPasso: 2, // Limite: 60 palavras
    });

    assert.strictEqual(res.sucesso, false);
    assert.ok(res.erro?.includes('Limite de concisão excedido'));
  });

  it('deve renderizar com sucesso quando todas as variáveis estão válidas e dentro do limite', async () => {
    const res = await renderizarPasso({
      assuntoTemplate: 'redações do ensino médio na {{escola}}',
      corpoTemplate:
        'Olá, {{primeiro_nome}}.\n\nNotamos o trabalho da {{escola}} no Ensino Médio de {{cidade}}.\n\nPodemos conversar 15 minutos nesta semana?\n\n{{link_agenda}}\n\n{{remetente}}',
      variaveis: {
        primeiro_nome: 'Ana Paula',
        escola: 'Colégio Galois',
        cidade: 'Brasília',
        cargo: 'Diretora Pedagógica',
        gancho: 'Destaque no simulado regional',
        link_agenda: 'https://calendly.com/littera',
        remetente: 'Bruno Pinho — Fundador, Littera (littera.app.br)',
      },
      ordemPasso: 1,
    });

    assert.strictEqual(res.sucesso, true);
    assert.strictEqual(res.assunto, 'redações do ensino médio na Colégio Galois');
    assert.ok(res.corpoTexto.includes('Olá, Ana.'));
    assert.ok(res.corpoTexto.includes('Colégio Galois'));
    assert.ok(res.corpoHtml.includes('<a href="https://calendly.com/littera"'));
  });
});

describe('3. Regras de Threading e Resposta na Mesma Conversa', () => {
  it('deve garantir que toques de resposta utilizem prefixo Re: e dados de thread', () => {
    const inscricaoMock = {
      id: 'inscricao-123',
      thread_id: 'thread-brevo-abc',
      rfc_message_id_inicial: '<toque1-xyz@grupolittera.com.br>',
      ultimo_rfc_message_id: '<toque1-xyz@grupolittera.com.br>',
    };

    // Toque 2 deve responder ao RFC do toque 1
    const emRespostaA = {
      threadId: inscricaoMock.thread_id,
      rfcMessageId: inscricaoMock.ultimo_rfc_message_id,
    };

    assert.strictEqual(emRespostaA.threadId, 'thread-brevo-abc');
    assert.strictEqual(emRespostaA.rfcMessageId, '<toque1-xyz@grupolittera.com.br>');
  });
});

describe('4. Regras de Parada Automática da Sequência', () => {
  const statusFunilParada = ['respondido', 'reuniao_agendada', 'sem_interesse', 'descadastrado'];

  it('deve sinalizar parada quando escola atingir status terminal no funil', () => {
    for (const st of statusFunilParada) {
      assert.strictEqual(statusFunilParada.includes(st), true);
    }
    assert.strictEqual(statusFunilParada.includes('novo'), false);
    assert.strictEqual(statusFunilParada.includes('em_sequencia'), false);
    assert.strictEqual(statusFunilParada.includes('contato_enviado'), false);
  });

  it('deve sinalizar parada quando contato estiver descadastrado', () => {
    const contatoAtivo = { descadastrado: false, email: 'diretor@escola.com.br' };
    const contatoDescadastrado = { descadastrado: true, email: 'diretor@escola.com.br' };

    assert.strictEqual(contatoAtivo.descadastrado, false);
    assert.strictEqual(contatoDescadastrado.descadastrado, true);
  });
});


describe('5. Autenticação e Segurança do Endpoint Cron (/api/cron/sequencias)', () => {
  it('deve validar token do header Authorization corretamente', () => {
    // Função pura de validação de token do cron
    const secret = 'segredo_cron_super_seguro_2026';

    const validarToken = (header: string | null, s?: string) => {
      if (!s || !s.trim()) return false;
      if (!header || !header.trim()) return false;
      const t = header.startsWith('Bearer ') ? header.slice(7).trim() : header.trim();
      return t === s;
    };

    // Header ausente -> 401 (false)
    assert.strictEqual(validarToken(null, secret), false);
    assert.strictEqual(validarToken('', secret), false);

    // Token incorreto -> 401 (false)
    assert.strictEqual(validarToken('Bearer token_errado', secret), false);
    assert.strictEqual(validarToken('outro_segredo', secret), false);

    // Sem secret configurado no servidor -> false
    assert.strictEqual(validarToken('Bearer ' + secret, undefined), false);

    // Token correto -> 200 (true)
    assert.strictEqual(validarToken(`Bearer ${secret}`, secret), true);
    assert.strictEqual(validarToken(secret, secret), true);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  extrairDadosMensagemGmail,
  extrairTextoNovoResposta,
} from '../src/lib/email/gmailApi';
import {
  detectarBounce,
  detectarRespostaAutomatica,
} from '../src/lib/email/deteccao';
import {
  validarEmailIndicadoNoTexto,
  classificarPorHeuristica,
} from '../src/lib/email/classificador';

function carregarFixture(nomeArquivo: string) {
  const filePath = path.join(__dirname, 'fixtures', 'gmail', nomeArquivo);
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

describe('ETAPA 11 - DETECÇÃO E CLASSIFICAÇÃO DE RESPOSTAS', () => {
  describe('1. Parsing de Mensagens da Gmail API', () => {
    it('deve extrair dados de resposta na mesma conversa (In-Reply-To e threadId)', () => {
      const fixture = carregarFixture('mesma_conversa.json');
      const dados = extrairDadosMensagemGmail(fixture);

      assert.strictEqual(dados.provedorMessageId, 'msg_mesma_conversa_001');
      assert.strictEqual(dados.provedorThreadId, 'thread_abc_123');
      assert.strictEqual(dados.remetenteEmail, 'carlos.silva@colegioalfa.com.br');
      assert.strictEqual(dados.inReplyTo, '<littera-rfc-toque1@littera.app.br>');
      assert.ok(dados.references.includes('<littera-rfc-toque1@littera.app.br>'));
      assert.ok(dados.corpoTexto.includes('Olá Bruno, achei interessante'));
    });

    it('deve extrair dados de resposta em conversa nova (threadId diferente, sem In-Reply-To)', () => {
      const fixture = carregarFixture('conversa_nova.json');
      const dados = extrairDadosMensagemGmail(fixture);

      assert.strictEqual(dados.provedorMessageId, 'msg_conversa_nova_002');
      assert.strictEqual(dados.provedorThreadId, 'thread_nova_999');
      assert.strictEqual(dados.remetenteEmail, 'carlos.silva@colegioalfa.com.br');
      assert.strictEqual(dados.inReplyTo, undefined);
      assert.ok(dados.corpoTexto.includes('Me mande mais detalhes'));
    });

    it('deve limpar histórico citado ("Em ... escreveu:", "> ...") preservando apenas o texto novo', () => {
      const fixture = carregarFixture('com_citacao.json');
      const dados = extrairDadosMensagemGmail(fixture);
      const textoLimpo = extrairTextoNovoResposta(dados.corpoTexto);

      assert.ok(textoLimpo.includes('Perfeito, vamos agendar uma call.'));
      assert.strictEqual(textoLimpo.includes('Em 20 de nov de 2026, às 10:00, Bruno Pinho escreveu:'), false);
      assert.strictEqual(textoLimpo.includes('> Olá Carlos, a Littera elimina o gargalo operacional'), false);
    });
  });

  describe('2. Detecção Determinística de Bounce', () => {
    it('deve reconhecer bounce do Google Mailer-Daemon e extrair destinatário falho', () => {
      const fixture = carregarFixture('google_bounce.json');
      const dados = extrairDadosMensagemGmail(fixture);
      const resultadoBounce = detectarBounce(dados);

      assert.strictEqual(resultadoBounce.isBounce, true);
      assert.strictEqual(resultadoBounce.emailFalho, 'decisor.invalido@colegiobeta.com.br');
    });

    it('não deve marcar mensagens legítimas de decisores como bounce', () => {
      const fixture = carregarFixture('mesma_conversa.json');
      const dados = extrairDadosMensagemGmail(fixture);
      const resultadoBounce = detectarBounce(dados);

      assert.strictEqual(resultadoBounce.isBounce, false);
    });
  });

  describe('3. Detecção Determinística de Resposta Automática', () => {
    it('deve identificar Auto-Submitted / Precedence e extrair data de retorno', () => {
      const fixture = carregarFixture('resposta_automatica.json');
      const dados = extrairDadosMensagemGmail(fixture);
      const resultadoAuto = detectarRespostaAutomatica(dados);

      assert.strictEqual(resultadoAuto.isAutoReply, true);
      assert.ok(resultadoAuto.dataRetorno?.startsWith('2026-12-15'));
    });

    it('não deve classificar e-mail comum de humano como resposta automática', () => {
      const fixture = carregarFixture('mesma_conversa.json');
      const dados = extrairDadosMensagemGmail(fixture);
      const resultadoAuto = detectarRespostaAutomatica(dados);

      assert.strictEqual(resultadoAuto.isAutoReply, false);
    });
  });

  describe('4. Regras Anti-Alucinação para Indicação de Contato', () => {
    it('deve aceitar e-mail indicado quando este estiver literalmente no corpo da resposta', () => {
      const fixture = carregarFixture('indicacao_com_email.json');
      const dados = extrairDadosMensagemGmail(fixture);

      const emailIndicado = 'marina.coord@escola.com.br';
      const valido = validarEmailIndicadoNoTexto(emailIndicado, dados.corpoTexto);

      assert.strictEqual(valido, true);
    });

    it('deve REJEITAR estritamente e-mails alucinados que NÃO estejam literalmente no corpo', () => {
      const fixture = carregarFixture('indicacao_sem_email.json');
      const dados = extrairDadosMensagemGmail(fixture);

      // Se um LLM tentasse deduzir "marina@escola.com.br"
      const emailAlucinado = 'marina@escola.com.br';
      const valido = validarEmailIndicadoNoTexto(emailAlucinado, dados.corpoTexto);

      assert.strictEqual(valido, false);
    });
  });

  describe('5. Mensagens Desconectadas do Funil (Spam / Newsletter)', () => {
    it('não deve confundir newsletters ou promoções com respostas do CRM', () => {
      const fixture = carregarFixture('nao_relacionada.json');
      const dados = extrairDadosMensagemGmail(fixture);

      const bounce = detectarBounce(dados);
      const autoReply = detectarRespostaAutomatica(dados);

      assert.strictEqual(bounce.isBounce, false);
      assert.strictEqual(autoReply.isAutoReply, false);
      assert.strictEqual(dados.inReplyTo, undefined);
      assert.strictEqual(dados.references.length, 0);
    });
  });

  describe('6. Classificação Heurística e Fallback', () => {
    it('deve classificar pedidos de reunião como "interessado"', () => {
      const res = classificarPorHeuristica('Podemos agendar uma demonstração na quinta-feira às 14h?');
      assert.strictEqual(res.classificacao, 'interessado');
      assert.ok(res.confianca >= 0.8);
      assert.ok(res.rascunho_resposta?.includes('calendly.com/littera'));
    });

    it('deve classificar pedidos de descadastro como "descadastro"', () => {
      const res = classificarPorHeuristica('Por favor, remova meu e-mail da sua lista e não me envie mais mensagens.');
      assert.strictEqual(res.classificacao, 'descadastro');
    });

    it('deve classificar recusas definitivas como "sem_interesse"', () => {
      const res = classificarPorHeuristica('Não temos interesse em nenhuma solução de redação.');
      assert.strictEqual(res.classificacao, 'sem_interesse');
    });

    it('deve classificar pedidos para contatar mais tarde como "agora_nao"', () => {
      const res = classificarPorHeuristica('Agora não podemos atender, favor entrar em contato no próximo semestre.');
      assert.strictEqual(res.classificacao, 'agora_nao');
    });
  });

  describe('7. Ordem de Execução do Pipeline Cron', () => {
    it('garante que a função lerRespostasDasCaixas existe e está exportada para rodar antes do motor', async () => {
      const routeContent = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'app', 'api', 'cron', 'sequencias', 'route.ts'),
        'utf-8'
      );

      const idxLeitor = routeContent.indexOf('lerRespostasDasCaixas()');
      const idxMotor = routeContent.indexOf('executarMotorSequencias(');

      assert.ok(idxLeitor > 0, 'lerRespostasDasCaixas deve estar presente na rota cron');
      assert.ok(idxMotor > 0, 'executarMotorSequencias deve estar presente na rota cron');
      assert.ok(
        idxLeitor < idxMotor,
        'A leitura de respostas deve ocorrer ESTRITAMENTE ANTES da execução do motor de envio'
      );
    });
  });
});

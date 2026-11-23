/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { verificarAssinaturaCalcom } from '../src/app/api/webhooks/calcom/route';
import { linkAgenda } from '../src/lib/agendamento/link';
import {
  calcularProximoDiaUtil,
  marcarReunioesPendentesRegistro,
  registrarResultadoPosReuniao,
} from '../src/lib/agendamento/posReuniao';
import { registrarReuniao } from '../src/lib/agendamento/registrar';

describe('ETAPA 12 - AGENDAMENTO DE REUNIÃO AUTOMÁTICO E PÓS-REUNIÃO', () => {
  const secretTeste = 'super_segredo_webhook_calcom_123';

  describe('1. Validação Criptográfica de Assinatura do Webhook Cal.com (HMAC-SHA256)', () => {
    it('deve aceitar payload com assinatura HMAC-SHA256 válida gerada com o segredo correto', () => {
      const payload = JSON.stringify({
        triggerEvent: 'BOOKING_CREATED',
        payload: { uid: 'booking_123' },
      });

      const signature = crypto
        .createHmac('sha256', secretTeste)
        .update(payload)
        .digest('hex');

      const valido = verificarAssinaturaCalcom(payload, signature, secretTeste);
      assert.strictEqual(valido, true);
    });

    it('deve rejeitar webhook com assinatura inválida (digest adulterado)', () => {
      const payload = JSON.stringify({ triggerEvent: 'BOOKING_CREATED' });
      const signatureFalsa = crypto
        .createHmac('sha256', 'segredo_errado')
        .update(payload)
        .digest('hex');

      const valido = verificarAssinaturaCalcom(payload, signatureFalsa, secretTeste);
      assert.strictEqual(valido, false);
    });

    it('deve rejeitar requisição sem cabeçalho de assinatura', () => {
      const payload = JSON.stringify({ triggerEvent: 'BOOKING_CREATED' });
      const valido = verificarAssinaturaCalcom(payload, null, secretTeste);
      assert.strictEqual(valido, false);
    });

    it('deve rejeitar requisição se o segredo não estiver configurado nas variáveis de ambiente', () => {
      const payload = JSON.stringify({ triggerEvent: 'BOOKING_CREATED' });
      const valido = verificarAssinaturaCalcom(payload, 'abc', '');
      assert.strictEqual(valido, false);
    });
  });

  describe('2. Link Personalizado de Agendamento (linkAgenda)', () => {
    const originalCalcomEnv = process.env.CALCOM_EVENT_URL;
    const originalGoogleEnv = process.env.GOOGLE_AGENDA_URL;

    beforeEach(() => {
      process.env.CALCOM_EVENT_URL = 'https://cal.com/littera/conversa-30min';
      delete process.env.GOOGLE_AGENDA_URL;
    });

    it('deve montar link do Cal.com com preenchimento de nome, e-mail e metadados de escola e contato', () => {
      const link = linkAgenda(
        { id: 'esc-12345', nome: 'Colégio Alfa' },
        { id: 'ctt-67890', nome: 'Professora Ana Clara', email: 'ana@colegioalfa.com.br' }
      );

      const url = new URL(link);
      assert.strictEqual(url.origin + url.pathname, 'https://cal.com/littera/conversa-30min');
      assert.strictEqual(url.searchParams.get('name'), 'Professora Ana Clara');
      assert.strictEqual(url.searchParams.get('email'), 'ana@colegioalfa.com.br');
      assert.strictEqual(url.searchParams.get('metadata[escola_id]'), 'esc-12345');
      assert.strictEqual(url.searchParams.get('metadata[contato_id]'), 'ctt-67890');
    });

    it('deve gerar link sem parâmetros de contato caso não sejam informados', () => {
      const link = linkAgenda({ id: 'esc-12345', nome: 'Colégio Alfa' }, null);

      const url = new URL(link);
      assert.strictEqual(url.searchParams.get('metadata[escola_id]'), 'esc-12345');
      assert.strictEqual(url.searchParams.get('name'), null);
      assert.strictEqual(url.searchParams.get('email'), null);
    });

    it('deve respeitar GOOGLE_AGENDA_URL sem parâmetros quando configurado para Opção B', () => {
      delete process.env.CALCOM_EVENT_URL;
      process.env.GOOGLE_AGENDA_URL = 'https://calendar.google.com/calendar/u/0/r/appointment/schedules/acb123';

      const link = linkAgenda({ id: 'esc-1' }, { id: 'ctt-1', email: 'teste@escola.com.br' });
      assert.strictEqual(link, 'https://calendar.google.com/calendar/u/0/r/appointment/schedules/acb123');

      // Restaura env
      process.env.CALCOM_EVENT_URL = originalCalcomEnv;
      process.env.GOOGLE_AGENDA_URL = originalGoogleEnv;
    });
  });

  describe('3. Cálculo de Próximo Dia Útil para Lembretes (calcularProximoDiaUtil)', () => {
    it('deve avançar de sexta-feira para a próxima segunda-feira', () => {
      // 2026-11-20 é uma sexta-feira
      const sexta = new Date('2026-11-20T14:00:00-03:00');
      const proximoDia = calcularProximoDiaUtil(sexta);
      // Segunda-feira seguinte é 2026-11-23
      assert.strictEqual(proximoDia, '2026-11-23');
    });

    it('deve pular feriado distrital ou nacional que caia em dia útil', () => {
      // 2026-11-27 é uma sexta-feira. Supor feriado na segunda 2026-11-30.
      const feriados = new Set(['2026-11-30']);
      const sexta = new Date('2026-11-27T10:00:00-03:00');
      const proximoDia = calcularProximoDiaUtil(sexta, feriados);
      // Deve pular o fim de semana (28, 29) e a segunda feriado (30), caindo na terça 2026-12-01
      assert.strictEqual(proximoDia, '2026-12-01');
    });
  });

  describe('4. Ações ao Agendar via registrarReuniao (Criação, Idempotência, Remarcação, Cancelamento)', () => {
    it('deve simular criação de reunião com avanço de funil, encerramento de inscrição e descarte da fila', async () => {
      const chamadasUpdates: Array<{ tabela: string; payload: any }> = [];
      const chamadasInserts: Array<{ tabela: string; payload: any }> = [];

      const mockDb = {
        from: (tabela: string) => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => {
                if (tabela === 'reunioes') return { data: null };
                if (tabela === 'escolas') return { data: { id: 'esc-test-1', nome: 'Colégio Teste', status_funil: 'respondido' } };
                if (tabela === 'contatos') return { data: { id: 'ctt-test-1', nome: 'Diretor João', email: 'joao@teste.com' } };
                return { data: null };
              },
              in: async () => {
                if (tabela === 'inscricoes') return { data: [{ id: 'insc-123' }] };
                return { data: [] };
              },
            }),
          }),
          insert: (payload: any) => {
            chamadasInserts.push({ tabela, payload });
            return {
              select: () => ({
                single: async () => ({
                  data: { id: 'reuniao-mock-1', ...payload },
                  error: null,
                }),
              }),
            };
          },
          update: (payload: any) => {
            chamadasUpdates.push({ tabela, payload });
            return {
              eq: () => ({
                select: () => ({
                  single: async () => ({ data: { id: 'mock', ...payload }, error: null }),
                }),
              }),
              in: () => ({
                in: () => ({}),
              }),
            };
          },
        }),
      };

      const res = await registrarReuniao({
        provedor: 'calcom',
        provedorEventoId: 'cal_event_001',
        inicio: '2026-11-25T14:00:00.000Z',
        fim: '2026-11-25T14:30:00.000Z',
        linkReuniao: 'https://meet.google.com/test-meet',
        escolaId: 'esc-test-1',
        contatoId: 'ctt-test-1',
        tipoEvento: 'criacao',
        dbClient: mockDb,
      });

      assert.strictEqual(res.sucesso, true);
      assert.strictEqual(res.reuniao?.status, 'agendada');

      // Verifica se a escola teve status_funil atualizado para reuniao_agendada
      const updateEscola = chamadasUpdates.find((u) => u.tabela === 'escolas');
      assert.ok(updateEscola, 'Deve atualizar tabela escolas');
      assert.strictEqual(updateEscola.payload.status_funil, 'reuniao_agendada');

      // Verifica se a inscrição foi atualizada para reuniao
      const updateInscricao = chamadasUpdates.find((u) => u.tabela === 'inscricoes');
      assert.ok(updateInscricao, 'Deve atualizar tabela inscricoes');
      assert.strictEqual(updateInscricao.payload.status, 'reuniao');
      assert.strictEqual(updateInscricao.payload.motivo_fim, 'reuniao_agendada');

      // Verifica se itens da fila foram descartados
      const updateFila = chamadasUpdates.find((u) => u.tabela === 'fila_envios');
      assert.ok(updateFila, 'Deve atualizar fila_envios');
      assert.strictEqual(updateFila.payload.status, 'descartado');

      // Verifica se interação reuniao_agendada foi registrada
      const insertInteracao = chamadasInserts.find((i) => i.tabela === 'interacoes');
      assert.ok(insertInteracao, 'Deve inserir em interacoes');
      assert.strictEqual(insertInteracao.payload.tipo, 'reuniao_agendada');
    });

    it('deve ser idempotente quando o mesmo evento de agendamento for recebido repetidas vezes', async () => {
      const mockDb = {
        from: (tabela: string) => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => {
                if (tabela === 'reunioes') {
                  return {
                    data: {
                      id: 'reuniao-existente-1',
                      provedor_evento_id: 'cal_event_001',
                      status: 'agendada',
                      inicio: '2026-11-25T14:00:00.000Z',
                    },
                  };
                }
                return { data: null };
              },
            }),
          }),
        }),
      };

      const res = await registrarReuniao({
        provedor: 'calcom',
        provedorEventoId: 'cal_event_001',
        inicio: '2026-11-25T14:00:00.000Z',
        fim: '2026-11-25T14:30:00.000Z',
        tipoEvento: 'criacao',
        dbClient: mockDb,
      });

      assert.strictEqual(res.sucesso, true);
      assert.strictEqual(res.idempotente, true);
      assert.ok(res.mensagem?.includes('idempotência'));
    });

    it('deve remarcar reunião atualizando horário de início/fim e status para remarcada', async () => {
      const chamadasUpdates: Array<{ tabela: string; payload: any }> = [];

      const mockDb = {
        from: (tabela: string) => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => {
                if (tabela === 'reunioes') {
                  return {
                    data: { id: 'reuniao-1', status: 'agendada', inicio: '2026-11-25T14:00:00Z' },
                  };
                }
                if (tabela === 'escolas') return { data: { id: 'esc-1', nome: 'Colégio Delta' } };
                return { data: null };
              },
            }),
          }),
          update: (payload: any) => {
            chamadasUpdates.push({ tabela, payload });
            return {
              eq: () => ({
                select: () => ({
                  single: async () => ({ data: { id: 'reuniao-1', ...payload }, error: null }),
                }),
              }),
            };
          },
          insert: () => ({}),
        }),
      };

      const novoInicio = '2026-11-26T15:00:00.000Z';
      const novoFim = '2026-11-26T15:30:00.000Z';

      const res = await registrarReuniao({
        provedor: 'calcom',
        provedorEventoId: 'cal_event_001',
        inicio: novoInicio,
        fim: novoFim,
        escolaId: 'esc-1',
        tipoEvento: 'remarcacao',
        dbClient: mockDb,
      });

      assert.strictEqual(res.sucesso, true);
      const updateReuniao = chamadasUpdates.find((u) => u.tabela === 'reunioes');
      assert.ok(updateReuniao);
      assert.strictEqual(updateReuniao.payload.status, 'remarcada');
      assert.strictEqual(updateReuniao.payload.inicio, novoInicio);
    });

    it('deve cancelar reunião, reverter status do funil para respondido e criar lembrete para o dia seguinte', async () => {
      const chamadasUpdates: Array<{ tabela: string; payload: any }> = [];
      const chamadasInserts: Array<{ tabela: string; payload: any }> = [];

      const mockDb = {
        from: (tabela: string) => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => {
                if (tabela === 'reunioes') return { data: { id: 'reuniao-1', status: 'agendada' } };
                if (tabela === 'escolas') return { data: { id: 'esc-1', nome: 'Colégio Ômega' } };
                return { data: null };
              },
            }),
          }),
          update: (payload: any) => {
            chamadasUpdates.push({ tabela, payload });
            return {
              eq: () => ({
                select: () => ({
                  single: async () => ({ data: { id: 'reuniao-1', ...payload }, error: null }),
                }),
              }),
            };
          },
          insert: (payload: any) => {
            chamadasInserts.push({ tabela, payload });
            return {};
          },
        }),
      };

      const res = await registrarReuniao({
        provedor: 'calcom',
        provedorEventoId: 'cal_event_001',
        inicio: '2026-11-25T14:00:00Z',
        fim: '2026-11-25T14:30:00Z',
        escolaId: 'esc-1',
        tipoEvento: 'cancelamento',
        dbClient: mockDb,
      });

      assert.strictEqual(res.sucesso, true);

      // Status da reunião cancelada
      const updateReuniao = chamadasUpdates.find((u) => u.tabela === 'reunioes');
      assert.strictEqual(updateReuniao?.payload.status, 'cancelada');

      // Status do funil volta para respondido
      const updateEscola = chamadasUpdates.find((u) => u.tabela === 'escolas');
      assert.strictEqual(updateEscola?.payload.status_funil, 'respondido');

      // Lembrete criado para o dia seguinte
      const insertLembrete = chamadasInserts.find((i) => i.tabela === 'lembretes');
      assert.ok(insertLembrete, 'Deve criar lembrete de cancelamento');
      assert.ok(insertLembrete.payload.texto.includes('Reunião cancelada — tentar reagendar'));
    });

    it('deve registrar reunião de origem desconhecida com escola nula e lembrete quando não houver casamento de lead', async () => {
      const chamadasInserts: Array<{ tabela: string; payload: any }> = [];

      const mockDb = {
        from: (tabela: string) => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null }),
            }),
          }),
          insert: (payload: any) => {
            chamadasInserts.push({ tabela, payload });
            return {
              select: () => ({
                single: async () => ({ data: { id: 'reuniao-desconhecida', ...payload }, error: null }),
              }),
            };
          },
          update: () => ({}),
        }),
      };

      const res = await registrarReuniao({
        provedor: 'calcom',
        provedorEventoId: 'cal_event_desconhecido',
        inicio: '2026-11-25T14:00:00Z',
        fim: '2026-11-25T14:30:00Z',
        emailParticipante: 'desconhecido@outrodominio.com',
        nomeParticipante: 'Visitante Desconhecido',
        tipoEvento: 'criacao',
        dbClient: mockDb,
      });

      assert.strictEqual(res.sucesso, true);
      assert.strictEqual(res.reuniao?.escola_id, null);

      // Lembrete de origem desconhecida criado
      const insertLembrete = chamadasInserts.find((i) => i.tabela === 'lembretes');
      assert.ok(insertLembrete);
      assert.ok(insertLembrete.payload.texto.includes('Reunião de origem desconhecida'));
    });
  });

  describe('5. Rotina de Pós-Reunião (marcarReunioesPendentesRegistro e registrarResultadoPosReuniao)', () => {
    it('deve marcar reuniões com término há mais de 1 hora como pendente_registro = true', async () => {
      const chamadasUpdates: Array<{ tabela: string; payload: any }> = [];

      const mockDb = {
        from: (tabela: string) => ({
          select: () => ({
            in: () => ({
              lte: () => ({
                eq: async () => ({
                  data: [{ id: 'reuniao-passada-1', fim: '2026-11-23T10:00:00Z', pendente_registro: false }],
                  error: null,
                }),
              }),
            }),
          }),
          update: (payload: any) => {
            chamadasUpdates.push({ tabela, payload });
            return {
              in: async () => ({ error: null }),
            };
          },
        }),
      };

      const res = await marcarReunioesPendentesRegistro(mockDb);
      assert.strictEqual(res.sucesso, true);
      assert.strictEqual(res.totalMarcadas, 1);

      const updateReunioes = chamadasUpdates.find((u) => u.tabela === 'reunioes');
      assert.strictEqual(updateReunioes?.payload.pendente_registro, true);
    });

    it('deve registrar desfecho "realizada" atualizando status, resultado e limpando pendência', async () => {
      const chamadasUpdates: Array<{ tabela: string; payload: any }> = [];
      const chamadasInserts: Array<{ tabela: string; payload: any }> = [];

      const mockDb = {
        from: (tabela: string) => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 'reuniao-1', escola_id: 'esc-1', escolas: { id: 'esc-1', nome: 'Colégio Sigma' } },
                error: null,
              }),
            }),
          }),
          update: (payload: any) => {
            chamadasUpdates.push({ tabela, payload });
            return {
              eq: () => ({
                select: () => ({
                  single: async () => ({ data: { id: 'reuniao-1', ...payload }, error: null }),
                }),
              }),
            };
          },
          insert: (payload: any) => {
            chamadasInserts.push({ tabela, payload });
            return {};
          },
        }),
      };

      const res = await registrarResultadoPosReuniao({
        reuniaoId: 'reuniao-1',
        status: 'realizada',
        resultado: 'proposta_enviada',
        notas: 'Apresentada proposta de R$ 1.800/mês para 3 turmas.',
        dbClient: mockDb,
      });

      assert.strictEqual(res.sucesso, true);
      const updateReuniao = chamadasUpdates.find((u) => u.tabela === 'reunioes');
      assert.strictEqual(updateReuniao?.payload.status, 'realizada');
      assert.strictEqual(updateReuniao?.payload.resultado, 'proposta_enviada');
      assert.strictEqual(updateReuniao?.payload.pendente_registro, false);

      // Registra interação reuniao_realizada
      const insertInteracao = chamadasInserts.find((i) => i.tabela === 'interacoes');
      assert.strictEqual(insertInteracao?.payload.tipo, 'reuniao_realizada');
    });

    it('deve registrar "nao_compareceu", limpar pendência e agendar lembrete no próximo dia útil', async () => {
      const chamadasUpdates: Array<{ tabela: string; payload: any }> = [];
      const chamadasInserts: Array<{ tabela: string; payload: any }> = [];

      const mockDb = {
        from: (tabela: string) => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 'reuniao-1', escola_id: 'esc-1', escolas: { id: 'esc-1', nome: 'Colégio Gama' } },
                error: null,
              }),
            }),
          }),
          update: (payload: any) => {
            chamadasUpdates.push({ tabela, payload });
            return {
              eq: () => ({
                select: () => ({
                  single: async () => ({ data: { id: 'reuniao-1', ...payload }, error: null }),
                }),
              }),
            };
          },
          insert: (payload: any) => {
            chamadasInserts.push({ tabela, payload });
            return {};
          },
        }),
      };

      const res = await registrarResultadoPosReuniao({
        reuniaoId: 'reuniao-1',
        status: 'nao_compareceu',
        notas: 'Aguardei 15 minutos na sala do Google Meet mas ninguém entrou.',
        dbClient: mockDb,
      });

      assert.strictEqual(res.sucesso, true);
      const updateReuniao = chamadasUpdates.find((u) => u.tabela === 'reunioes');
      assert.strictEqual(updateReuniao?.payload.status, 'nao_compareceu');
      assert.strictEqual(updateReuniao?.payload.resultado, null);
      assert.strictEqual(updateReuniao?.payload.pendente_registro, false);

      // Lembrete criado no próximo dia útil
      const insertLembrete = chamadasInserts.find((i) => i.tabela === 'lembretes');
      assert.ok(insertLembrete, 'Deve criar lembrete de reagendamento');
      assert.ok(insertLembrete.payload.texto.includes('Não compareceu na reunião'));
    });
  });
});

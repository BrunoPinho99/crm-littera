# Módulo de Agendamento Automático de Reuniões — Littera CRM

Este documento descreve a arquitetura de agendamento automático de reuniões no **Littera CRM**, detalhando a implementação ativa baseada em **Cal.com com Webhooks** (Opção A) e a arquitetura alternativa de verificação periódica via **Google Calendar API** (Opção B).

---

## 1. Visão Geral da Arquitetura

O agendamento automático resolve um gargalo crítico no fluxo de prospecção comercial: anteriormente, a reunião só entrava no CRM se o operador abrisse o modal manual, clicasse no link de modelo do Google Agenda e alterasse a etapa do lead à mão.

Com o agendamento automatizado:
1. Cada e-mail da cadência de prospecção (Etapa 10) carrega a variável `{{link_agenda}}`, gerada dinamicamente pela função `linkAgenda(escola, contato)`.
2. Quando o decisor pedagógico (diretor, coordenador ou mantenedor) seleciona um horário na agenda:
   - A reunião é registrada imediatamente na tabela `reunioes` (com provedor, horários de início/fim e link da videoconferência).
   - O status do funil da escola avança automaticamente para `reuniao_agendada`.
   - A inscrição ativa da escola na cadência é encerrada com status `reuniao`.
   - Mensagens pendentes na fila de envios (`fila_envios`) em `aguardando_aprovacao` ou `aprovado` são descartadas para evitar mensagens descontextualizadas pós-agendamento.
   - Uma interação do tipo `reuniao_agendada` é registrada no histórico da instituição.
   - Uma notificação rica por e-mail é enviada para `NOTIFICAR_EMAIL` contendo os dados do decisor, data/hora em horário oficial de Brasília (`America/Sao_Paulo`), link do Meet e o **Dossiê SDR** (`resumo_pesquisa`) da instituição.
3. **Pós-reunião:** após 1 hora do término da reunião, o CRM sinaliza a reunião como pendente de desfecho. O usuário informa se ela foi **realizada** (e seu resultado: proposta enviada, piloto, venda, etc.) ou se houve **no-show** (não compareceu), criando neste último caso um lembrete no próximo dia útil para tentativa de reagendamento.

---

## 2. Opção Implementada: (A) Cal.com com Webhook Instantâneo

### 2.1. Link Personalizado com Metadados e Pré-preenchimento
Localizado em `src/lib/agendamento/link.ts`:
- **URL Base:** Configurada via variável `CALCOM_EVENT_URL` (ex: `https://cal.com/littera/conversa-30min`).
- **Pré-preenchimento:** Inclui `name` e `email` do decisor na query string.
- **Metadados:** Adiciona `metadata[escola_id]` e `metadata[contato_id]`. Quando o decisor conclui o agendamento, o Cal.com repassa esses metadados intactos no payload do webhook, garantindo 100% de precisão de atribuição sem depender de heurísticas.

Exemplo de link gerado:
```
https://cal.com/littera/conversa-30min?name=Maria+Santos&email=maria%40colegioalfa.com.br&metadata%5Bescola_id%5D=uuid-escola&metadata%5Bcontato_id%5D=uuid-contato
```

### 2.2. Webhook Seguro: `POST /api/webhooks/calcom`
- **Validação Criptográfica:** O Cal.com assina o corpo da requisição bruta (raw body) usando HMAC-SHA256 e envia no cabeçalho `X-Cal-Signature-256`. A função `verificarAssinaturaCalcom` calcula o digest local usando a chave `CALCOM_WEBHOOK_SECRET` e valida via `crypto.timingSafeEqual`. Assinatura ausente ou inválida retorna HTTP 401.
- **Eventos Tratados:**
  - `BOOKING_CREATED`: cria a reunião no CRM, avança o funil, encerra a sequência, descarta a fila e notifica por e-mail.
  - `BOOKING_RESCHEDULED`: atualiza horário de início e término, marca status `remarcada`, registra interação e notifica a equipe.
  - `BOOKING_CANCELLED`: atualiza status para `cancelada`, reverte o status do funil da escola de volta para `respondido`, cria um lembrete para o dia seguinte ("Reunião cancelada — tentar reagendar") e registra o evento.
- **Casamento de Leads:**
  1. Identificação via `metadata.escola_id`.
  2. Fallback por e-mail do participante (`attendee.email`) na tabela `contatos` ou `escolas.email_geral`.
  3. Sem casamento: cria a reunião com `escola_id = null`, gera um lembrete de `"Reunião de origem desconhecida"` e envia e-mail de alerta para vínculo manual na interface.
- **Idempotência:** O Cal.com fornece um `uid` único por reserva. A tabela `reunioes` possui restrição `UNIQUE(provedor_evento_id)`. Se o mesmo webhook for reenviado pelo Cal.com (retentativa de rede), o CRM reconhece a existência do evento e não duplica alertas, interações nem registros.

---

## 3. Arquitetura Alternativa Documentada: (B) Google Agenda com Calendar API

A Opção B utiliza a funcionalidade nativa de **Páginas de Agendamento de Horários** (Appointment Schedules) do Google Agenda corporativo (Google Workspace).

### 3.1. Requisitos e Conexão OAuth
1. **Configuração no Google Cloud Console:**
   - Adicionar o escopo `https://www.googleapis.com/auth/calendar.readonly` ao app OAuth.
2. **Conexão na Página `/configuracoes/email`:**
   - O usuário conecta a sua conta Google com o escopo de leitura do calendário.
   - O `refresh_token` retornado pelo fluxo OAuth é criptografado com AES-256-GCM usando a variável `TOKEN_ENCRYPTION_KEY` e salvo na tabela `caixas_envio.google_refresh_token`.

### 3.2. Link da Agenda do Google
- **URL Base:** Configurada na variável `GOOGLE_AGENDA_URL` (ex: `https://calendar.google.com/calendar/u/0/r/appointment/schedules/...`).
- Como a agenda de horários do Google não aceita passagem de metadados arbitrários de CRM via query string, o link é enviado limpo.
- A identificação do lead no CRM é realizada 100% pelo e-mail do convidado que confirmou a presença.

### 3.3. Sincronização Incremental via Calendar API (`syncToken`)
Como o Google Calendar não emite webhooks abertos sem infraestrutura complexa de push notifications (Google Cloud Pub/Sub ou verificação de domínio com renovação de canais a cada 7 dias), a leitura é acionada periodicamente a cada execução do cron de sequências (`/api/cron/sequencias`):

```typescript
// Fluxo conceitual de sincronização incremental via Google Calendar API:
async function sincronizarGoogleCalendar(caixaEnvio: CaixaEnvio) {
  const oauth2Client = obterOAuth2Client(caixaEnvio);
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  // Utiliza syncToken para buscar apenas eventos alterados/criados desde a última leitura
  const params: calendar_v3.Params$Resource$Events$List = {
    calendarId: 'primary',
    singleEvents: true,
  };

  if (caixaEnvio.ultimo_sync_token) {
    params.syncToken = caixaEnvio.ultimo_sync_token;
  } else {
    // Primeira leitura: últimos 30 dias
    params.timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  }

  try {
    const res = await calendar.events.list(params);
    const eventos = res.data.items || [];

    for (const evento of eventos) {
      // 1. Identifica se o evento foi cancelado
      if (evento.status === 'cancelled') {
        await registrarReuniao({
          provedor: 'google',
          provedorEventoId: evento.id!,
          tipoEvento: 'cancelamento',
          ...
        });
        continue;
      }

      // 2. Extrai e-mail dos convidados (attendees)
      const convidados = evento.attendees || [];
      const convidadoExterno = convidados.find(a => !a.self && a.email);
      if (!convidadoExterno?.email) continue;

      // 3. Busca escola/contato correspondente no banco
      const contato = await buscarContatoPorEmail(convidadoExterno.email);
      if (!contato) continue; // Evento pessoal ou fora do funil

      // 4. Registra criação ou remarcação
      await registrarReuniao({
        provedor: 'google',
        provedorEventoId: evento.id!,
        inicio: evento.start?.dateTime || evento.start?.date!,
        fim: evento.end?.dateTime || evento.end?.date!,
        linkReuniao: evento.hangoutLink || evento.location || null,
        escolaId: contato.escola_id,
        contatoId: contato.id,
        emailParticipante: convidadoExterno.email,
        tipoEvento: reuniaoJaExiste ? 'remarcacao' : 'criacao',
      });
    }

    // Salva o novo nextSyncToken para a próxima execução do cron
    if (res.data.nextSyncToken) {
      await atualizarSyncToken(caixaEnvio.id, res.data.nextSyncToken);
    }
  } catch (err: any) {
    if (err.code === 410) {
      // SyncToken expirado: resetar e refazer sincronização completa
      await atualizarSyncToken(caixaEnvio.id, null);
    }
  }
}
```

### 3.4. Comparativo Técnico entre as Opções

| Característica | (A) Cal.com com Webhook | (B) Google Agenda com Calendar API |
| :--- | :--- | :--- |
| **Tempo de Resposta** | **Instantâneo (0 segundos)** via Webhook HTTP POST | **Até 10-15 minutos** (aguarda próximo ciclo do cron) |
| **Precisão de Atribuição** | **100% exata** (metadados `escola_id` e `contato_id` via URL) | Depende exclusivamente do casamento exato do e-mail |
| **Pré-preenchimento** | Nativo (`name`, `email` chegam prontos para o decisor) | Manual pelo convidado ao preencher os campos |
| **Complexidade de Infra** | Simples (1 rota de webhook com HMAC) | Média (gestão de escopos OAuth, renovação de tokens e syncTokens) |
| **Cancelamento / Remarcação** | Notificado em tempo real pelo provedor | Detectado por comparação no syncToken incremental |

---

## 4. Rotina Pós-Reunião

1. **Varredura no Cron:**
   Durante a execução periódica do endpoint `/api/cron/sequencias`, a função `marcarReunioesPendentesRegistro()` busca reuniões cujo horário de término (`fim`) seja anterior a **1 hora atrás** e cujo `pendente_registro` seja falso. Elas são marcadas com `pendente_registro = true`.
2. **Interface do Usuário:**
   - O cabeçalho exibe um alerta interativo: `⚠️ X pós-reunião pendente`.
   - O card da escola na coluna "Reunião Agendada" do Kanban exibe o botão destacado **"Pós-Reunião Pendente • Registrar"**.
   - A página `/reunioes` exibe botão de ação direta.
3. **Modal de Desfecho:**
   - **Realizada:** Seleciona o resultado comercial (`proposta_enviada`, `teste_gratuito`, `fechado`, `sem_fit`, `followup`) e notas. Registra a interação correspondente e encerra a pendência.
   - **Não compareceu (No-show):** Registra a ausência, limpa a pendência e agenda automaticamente um lembrete para o **próximo dia útil** (calculado via calendário comercial de Brasília) para que o SDR tente novo contato.

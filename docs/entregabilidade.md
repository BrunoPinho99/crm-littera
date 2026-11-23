# Infraestrutura de Envio e Entregabilidade — Littera CRM

Este documento descreve a arquitetura de envio de e-mails, configuração de domínio de prospecção, autenticação DNS (SPF, DKIM, DMARC), encaminhamento de respostas, plano de aquecimento e regras rígidas de segurança implementadas na **Etapa 9**.

---

## 1. Arquitetura Implementada

A infraestrutura foi desenhada para isolar o domínio principal (`littera.app.br`) de qualquer risco de reputação associado a campanhas de cold outreach B2B, garantindo taxa de entrega na caixa de entrada primária dos decisores escolares.

```
                      +---------------------------------------+
                      | Domínio Dedicado de Prospecção        |
                      | grupolittera.com.br                   |
                      +-------------------+-------------------+
                                          |
                 +------------------------+------------------------+
                 |                                                 |
                 v                                                 v
   [OUTBOUND: Disparos Transacionais]             [INBOUND: Recebimento de Respostas]
         Brevo API v3 (REST)                              ImprovMX Forwarding
   POST https://api.brevo.com/v3/smtp/email         bruno@grupolittera.com.br
   • API Key: BREVO_API_KEY                                        |
   • Headers: Message-ID, List-Unsubscribe,                        v
     List-Unsubscribe-Post, In-Reply-To             Encaminha para Gmail pessoal
   • Rastreamento na tabela `interacoes`            (bruno.pinho.brasilia@gmail.com)
```

### 1.1 Componentes Principais
1. **Domínio Dedicado (`grupolittera.com.br`):**
   - Redirecionamento Web 301 permanente apontando para o site oficial `https://littera.app.br`. Caso um decisor digite `grupolittera.com.br` no navegador, ele é imediatamente encaminhado para a plataforma principal.
2. **Motor de Disparo Outbound (Brevo API v3):**
   - Chamadas HTTP diretas autenticadas via `api-key` no endpoint oficial `https://api.brevo.com/v3/smtp/email`.
   - Gera e envia um cabeçalho RFC 5322 `Message-ID` (`<uuid@grupolittera.com.br>`) para agrupamento confiável de conversas.
   - Cabeçalhos RFC 8058 `List-Unsubscribe` e `List-Unsubscribe-Post: List-Unsubscribe=One-Click` para descadastro direto nos clientes de e-mail (Gmail, Apple Mail, Outlook).
3. **Inbound & Respostas (ImprovMX):**
   - Encaminhamento direto de `bruno@grupolittera.com.br` para a conta pessoal do administrador no Gmail.
   - Quando um diretor ou coordenador responde, a mensagem cai na caixa pessoal e pode ser respondida mantendo o thread ou cadastrada no CRM.
4. **Governança no Banco de Dados (Supabase):**
   - Tabela `caixas_envio`: gerencia status (ativo/pausado), limites diários e data de início do aquecimento.
   - Tabela `interacoes`: registra `provedor_message_id`, `provedor_thread_id` e `rfc_message_id`.
   - Tabela `descadastros`: lista negra (opt-out) com trigger que bloqueia contatos automaticamente.

---

## 2. Configurações de DNS (Zona `grupolittera.com.br`)

Para obter alinhamento total e validação de autenticidade, os seguintes registros DNS devem estar cadastrados no provedor do domínio (ex: Registro.br, Cloudflare ou Hostinger):

### 2.1 SPF (Sender Policy Framework)
Autoriza os servidores do Brevo e os MX do ImprovMX a enviarem e receberem pelo domínio:

| Tipo | Nome / Host | Valor / Dados | TTL |
|---|---|---|---|
| `TXT` | `@` (ou vazio) | `v=spf1 include:spf.brevo.com include:spf.improvmx.com ~all` | 3600 |

### 2.2 DKIM (DomainKeys Identified Mail)
Chaves assimétricas fornecidas pelo Brevo para assinatura criptográfica de cada mensagem:

| Tipo | Nome / Host | Valor / Dados | TTL |
|---|---|---|---|
| `CNAME` | `mail._domainkey` | `mail._domainkey.brevo.com` | 3600 |
| `CNAME` | `brevo1._domainkey` | `brevo1._domainkey.brevo.com` | 3600 |

*(Consulte os valores exatos de CNAME na sua conta Brevo em Senders & IP).*

### 2.3 DMARC (Domain-based Message Authentication)
Política de integridade e recebimento de relatórios agregados:

| Tipo | Nome / Host | Valor / Dados | TTL |
|---|---|---|---|
| `TXT` | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@grupolittera.com.br; pct=100; sp=none; aspf=r; adkim=r` | 3600 |

*Nota: Iniciamos com `p=none` para monitoramento nos primeiros 14 dias. Após validação de que 100% dos envios passam no SPF e DKIM, alterar para `p=quarantine` ou `p=reject`.*

### 2.4 MX (Mail Exchanger para ImprovMX)
Recebimento de respostas enviadas pelos diretores das escolas:

| Tipo | Nome / Host | Prioridade | Valor / Dados |
|---|---|---|---|
| `MX` | `@` | 10 | `mx1.improvmx.com` |
| `MX` | `@` | 20 | `mx2.improvmx.com` |

---

## 3. Como Conferir a Entregabilidade no Gmail ("Mostrar original")

Após enviar um e-mail de teste pelo painel `/configuracoes/email`, siga este passo a passo para auditoria:

1. Abra a mensagem de teste recebida na sua caixa de entrada do **Gmail**.
2. No canto superior direito da mensagem, clique no ícone de **três pontinhos verticais** ("Mais opções").
3. Selecione a opção **"Mostrar original"** (Show original).
4. Na página exibida, verifique a tabela de cabeçalhos de autenticação:
   - **SPF:** Deve constar **`PASS`** com o IP correspondente do Brevo e domínio `grupolittera.com.br`.
   - **DKIM:** Deve constar **`PASS`** com `domain: grupolittera.com.br`.
   - **DMARC:** Deve constar **`PASS`**.
5. Na listagem de cabeçalhos brutos logo abaixo, confirme a presença de:
   - `Message-ID: <...-uuid...@grupolittera.com.br>`
   - `List-Unsubscribe: <https://littera.app.br/descadastro?t=...>`
   - `List-Unsubscribe-Post: List-Unsubscribe=One-Click`

---

## 4. Plano de Aquecimento Gradual (Warmup)

A reputação de um domínio e IP novos depende de consistência e aumento lento e progressivo de volume. O cálculo é executado automaticamente pela função pura `calcularLimiteHoje`:

$$\text{Limite Hoje} = \min(\text{limite\_inicial} + \text{semanas} \times \text{incremento\_semanal}, \text{limite\_maximo})$$

| Semana | Dias Transcorridos | Limite Diário por Caixa | Volume Semanal Máximo | Foco Operacional |
|---|---|---|---|---|
| **Semana 0** | Dias 0 a 6 | **10 e-mails / dia** | ~70 e-mails | E-mails ultra-qualificados com `email_status = 'valido'` |
| **Semana 1** | Dias 7 a 13 | **15 e-mails / dia** | ~105 e-mails | Monitoramento estrito de bounce e abertura |
| **Semana 2** | Dias 14 a 20 | **20 e-mails / dia** | ~140 e-mails | Volume padrão diário do SDR (meta 20 leads/dia) |
| **Semana 3** | Dias 21 a 27 | **25 e-mails / dia** | ~175 e-mails | Estabilidade de entregabilidade |
| **Semana 4** | Dias 28 a 34 | **30 e-mails / dia** | ~210 e-mails | Início de follow-ups moderados |
| **Semana 5** | Dias 35 a 41 | **35 e-mails / dia** | ~245 e-mails | Consolidação de reputação |
| **Semana 6** | Dias 42 a 48 | **40 e-mails / dia** | ~280 e-mails | Monitoramento contínuo |
| **Semana 7** | Dias 49 a 55 | **45 e-mails / dia** | ~315 e-mails | Pré-teto |
| **Semana 8+**| Dia 56 em diante | **50 e-mails / dia** | **350 e-mails** | **Teto Máximo Permanente de Segurança** |

---

## 5. Regras Rígidas de Segurança e Proteção de Reputação

Para proteger a integridade do domínio contra bloqueios e blacklists:

1. **Teto Máximo Absoluto:** Nenhuma caixa individual deve ultrapassar **50 envios/dia**.
2. **Gatilho de Pausa por Bounce:** Se a taxa de devolução (*bounce rate*) ultrapassar **2%** em qualquer dia, a caixa deve ser pausada imediatamente no painel de configurações para inspeção da lista.
3. **Reclamações de Spam:** Tolerância zero. Caso ocorra 1 reclamação de spam (*spam complaint*), o envio para a escola ou provedor em questão deve ser abortado.
4. **Verificação Prévia Obrigatória:** Nenhum e-mail pode ser enviado sem aprovação na regra `pode_enviar` (`email_status = 'valido'`). E-mails com status `invalido`, `nao_verificado` ou `desconhecido` são sumariamente rejeitados pelo orquestrador `enviarEmail`.
5. **Descadastro Imediato (Opt-Out):**
   - Toda mensagem contém o cabeçalho `List-Unsubscribe: <URL>` e `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.
   - Se o destinatário clicar no link no rodapé ou no botão de cancelamento do Gmail, seu e-mail é imediatamente inserido na tabela `descadastros` e marcado como `descadastrado = true` no banco.
6. **Rodapé Transparente com Dados Reais:**
   - Todo e-mail contém obrigatoriamente a Razão Social (`LITTERA_RAZAO_SOCIAL`), Cidade/Endereço (`LITTERA_ENDERECO`) e justificativa de interesse público educacional, em conformidade com as boas práticas anti-spam e LGPD.

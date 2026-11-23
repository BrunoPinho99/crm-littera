import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { enviarEmail } from '@/lib/envio/enviarEmail';
import { podeEnviarEmail } from '@/lib/envio/regrasEnvio';
import { carregarFeriadosSet } from '@/actions/sequencias';
import { estaNaJanelaDeEnvio, agendarProximoPasso } from './janelas';
import { renderizarPasso } from './render';
import {
  Inscricao,
  SequenciaPasso,
  Sequencia,
  Contato,
  Escola,
  FilaEnvio,
} from '@/types/database';

export interface MotorExecucaoResultado {
  executou: boolean;
  motivo?: string;
  inscricoesProcessadas: number;
  enviosRealizados: number;
  erros: string[];
}

/**
 * Verifica condições de parada automáticas da inscrição:
 * 1. Escola com status 'respondido', 'reuniao_agendada', 'sem_interesse' ou 'descadastrado'
 * 2. Contato descadastrado ou e-mail na tabela de descadastros
 * 3. Bounce registrado para este contato/escola
 */
async function verificarCondicoesParada(
  inscricao: Inscricao,
  escola: Escola,
  contato: Contato | null
): Promise<{ parar: boolean; motivo?: string }> {
  // 1. Status do funil da escola
  const statusParada = ['respondido', 'reuniao_agendada', 'sem_interesse', 'descadastrado'];
  if (statusParada.includes(escola.status_funil)) {
    return { parar: true, motivo: `escola_status_${escola.status_funil}` };
  }

  // 2. Descadastro do contato
  if (contato) {
    if (contato.descadastrado) {
      return { parar: true, motivo: 'contato_descadastrado' };
    }

    if (contato.email) {
      const { data: desc } = await supabaseAdmin
        .from('descadastros')
        .select('id')
        .eq('email', contato.email.trim().toLowerCase())
        .maybeSingle();

      if (desc) {
        return { parar: true, motivo: 'email_em_descadastros' };
      }
    }
  }

  // 3. Bounce registrado
  if (contato?.email) {
    const { data: bounce } = await supabaseAdmin
      .from('interacoes')
      .select('id')
      .eq('escola_id', escola.id)
      .eq('tipo', 'email_bounce')
      .limit(1)
      .maybeSingle();

    if (bounce) {
      return { parar: true, motivo: 'email_bounce_registrado' };
    }
  }

  return { parar: false };
}

/**
 * Seleciona outro contato qualificado da escola para o passo multithread (toque 4)
 * Prioridade: mantenedor > diretor_geral > diretor_pedagogico > coordenador_em > outro
 */
async function selecionarOutroContatoQualificado(
  escolaId: string,
  contatoAtualId?: string | null
): Promise<Contato | null> {
  const { data: contatos } = await supabaseAdmin
    .from('contatos')
    .select('*')
    .eq('escola_id', escolaId);

  if (!contatos || contatos.length === 0) return null;

  const ordemTipos: Record<string, number> = {
    mantenedor: 1,
    diretor_geral: 2,
    diretor_pedagogico: 3,
    coordenador_em: 4,
    outro: 5,
    secretaria: 6,
  };

  const outrosElegiveis = (contatos as Contato[])
    .filter((c) => c.id !== contatoAtualId && !c.descadastrado && Boolean(c.email) && podeEnviarEmail(c.email_status))
    .sort((a, b) => {
      const pesoA = ordemTipos[a.tipo || 'outro'] || 99;
      const pesoB = ordemTipos[b.tipo || 'outro'] || 99;
      return pesoA - pesoB;
    });

  return outrosElegiveis[0] || null;
}

/**
 * Executa uma rodada do motor de sequências:
 * 1. Valida se está na janela comercial permitida (Brasília, dias úteis, 08h-11h30 / 14h-17h, fora de feriados)
 * 2. Processa inscrições ativas elegíveis, checando regras de parada e preparando o próximo passo na fila
 * 3. Dispara itens aprovados da fila de envio com espaçamento e cabeçalhos de thread (In-Reply-To / References)
 */
export async function executarMotorSequencias(options?: {
  forcarJanela?: boolean;
  limite?: number;
}): Promise<MotorExecucaoResultado> {
  const feriadosSet = await carregarFeriadosSet();
  const agora = new Date();

  // 1. Checagem de janela comercial
  const naJanela = estaNaJanelaDeEnvio(agora, feriadosSet);
  if (!naJanela && !options?.forcarJanela) {
    return {
      executou: false,
      motivo: 'fora_da_janela_comercial',
      inscricoesProcessadas: 0,
      enviosRealizados: 0,
      erros: [],
    };
  }

  const limite = options?.limite || 10;
  const erros: string[] = [];
  let inscricoesProcessadas = 0;
  let enviosRealizados = 0;

  // 2. PARTE A: Enfileirar próximos passos das inscrições ativas
  const { data: inscricoes, error: inscricoesErr } = await supabaseAdmin.rpc(
    'obter_inscricoes_para_processar',
    { p_limite: limite }
  );

  if (inscricoesErr) {
    erros.push(`Erro ao obter inscrições: ${inscricoesErr.message}`);
  } else if (inscricoes && inscricoes.length > 0) {
    for (const inscricao of inscricoes as Inscricao[]) {
      try {
        // Carrega escola e contato
        const [{ data: escola }, { data: contato }, { data: sequencia }] = await Promise.all([
          supabaseAdmin.from('escolas').select('*').eq('id', inscricao.escola_id).single(),
          inscricao.contato_id
            ? supabaseAdmin.from('contatos').select('*').eq('id', inscricao.contato_id).single()
            : Promise.resolve({ data: null }),
          supabaseAdmin.from('sequencias').select('*').eq('id', inscricao.sequencia_id).single(),
        ]);

        if (!escola || !sequencia) {
          erros.push(`Inscrição ${inscricao.id} com escola ou sequência inexistente.`);
          continue;
        }

        // Verifica regras de parada
        const parada = await verificarCondicoesParada(inscricao, escola as Escola, (contato as Contato) || null);
        if (parada.parar) {
          await supabaseAdmin
            .from('inscricoes')
            .update({
              status: 'cancelada',
              motivo_cancelamento: parada.motivo,
              atualizado_em: new Date().toISOString(),
            })
            .eq('id', inscricao.id);

          // Descarta itens pendentes da fila para esta inscrição
          await supabaseAdmin
            .from('fila_envios')
            .update({ status: 'descartado', erro: `Inscrição cancelada: ${parada.motivo}` })
            .eq('inscricao_id', inscricao.id)
            .in('status', ['aguardando_aprovacao', 'aprovado']);

          inscricoesProcessadas++;
          continue;
        }

        // Determina o próximo passo
        const proximaOrdem = (inscricao.passo_atual || 0) + 1;
        const { data: passos } = await supabaseAdmin
          .from('sequencia_passos')
          .select('*')
          .eq('sequencia_id', inscricao.sequencia_id)
          .eq('ordem', proximaOrdem)
          .eq('ativo', true);

        const passo = passos && passos.length > 0 ? (passos[0] as SequenciaPasso) : null;

        if (!passo) {
          // Checa se já atingiu o fim da sequência
          const { data: passosFuturos } = await supabaseAdmin
            .from('sequencia_passos')
            .select('id')
            .eq('sequencia_id', inscricao.sequencia_id)
            .gt('ordem', inscricao.passo_atual)
            .eq('ativo', true);

          if (!passosFuturos || passosFuturos.length === 0) {
            // Sequência concluída
            await supabaseAdmin
              .from('inscricoes')
              .update({
                status: 'concluida',
                atualizado_em: new Date().toISOString(),
              })
              .eq('id', inscricao.id);
          }
          inscricoesProcessadas++;
          continue;
        }

        // Verifica se já existe item enfileirado para este passo desta inscrição
        const { data: itemExistente } = await supabaseAdmin
          .from('fila_envios')
          .select('id, status')
          .eq('inscricao_id', inscricao.id)
          .eq('passo_id', passo.id)
          .in('status', ['aguardando_aprovacao', 'aprovado'])
          .maybeSingle();

        if (itemExistente) {
          // Já está na fila aguardando ação, não duplica
          inscricoesProcessadas++;
          continue;
        }

        // Se for multithread (toque 4), tenta buscar outro contato
        let contatoAlvo = contato as Contato | null;
        if (passo.tipo === 'email_outro_contato') {
          const outroContato = await selecionarOutroContatoQualificado(inscricao.escola_id, inscricao.contato_id);
          if (outroContato) {
            contatoAlvo = outroContato;
          } else {
            // Se não houver outro contato, pula o passo 4 e agenda o 5
            const { data: passo5List } = await supabaseAdmin
              .from('sequencia_passos')
              .select('*')
              .eq('sequencia_id', inscricao.sequencia_id)
              .eq('ordem', 5)
              .eq('ativo', true);

            const passo5 = passo5List && passo5List[0] as SequenciaPasso;
            const diasAvançar = passo5 ? passo5.dias_apos_anterior : 4;
            const proximaData = agendarProximoPasso(agora, diasAvançar, feriadosSet);

            await supabaseAdmin
              .from('inscricoes')
              .update({
                passo_atual: 4,
                proximo_envio_em: proximaData.toISOString(),
                atualizado_em: new Date().toISOString(),
              })
              .eq('id', inscricao.id);

            inscricoesProcessadas++;
            continue;
          }
        }

        if (!contatoAlvo || !contatoAlvo.email) {
          erros.push(`Inscrição ${inscricao.id} não possui contato válido para o passo ${passo.ordem}.`);
          continue;
        }

        // Busca dados da caixa para remetente
        let nomeRemetente = 'Bruno Pinho — Fundador, Littera (littera.app.br)';
        if (inscricao.caixa_envio_id) {
          const { data: cx } = await supabaseAdmin
            .from('caixas_envio')
            .select('nome_remetente')
            .eq('id', inscricao.caixa_envio_id)
            .maybeSingle();
          if (cx?.nome_remetente) {
            nomeRemetente = `${cx.nome_remetente} — Fundador, Littera (littera.app.br)`;
          }
        }

        // Renderiza conteúdo do passo
        const renderResult = await renderizarPasso({
          assuntoTemplate: passo.assunto_template,
          corpoTemplate: passo.corpo_template,
          variaveis: {
            primeiro_nome: contatoAlvo.nome,
            escola: (escola as Escola).nome,
            cidade: (escola as Escola).cidade || 'Brasília',
            cargo: contatoAlvo.cargo || 'Direção Pedagógica',
            gancho: (escola as Escola).gancho_personalizacao,
            link_agenda: 'https://calendly.com/littera',
            remetente: nomeRemetente,
          },
          usarIa: passo.usar_ia,
          ordemPasso: passo.ordem,
        });

        if (!renderResult.sucesso) {
          erros.push(`Falha ao renderizar passo ${passo.ordem} para escola ${escola.nome}: ${renderResult.erro}`);
          continue;
        }

        const modoAprovacao = Boolean((sequencia as Sequencia).modo_aprovacao);
        const statusFila = modoAprovacao ? 'aguardando_aprovacao' : 'aprovado';

        // Insere na fila de envios
        await supabaseAdmin.from('fila_envios').insert({
          inscricao_id: inscricao.id,
          passo_id: passo.id,
          contato_id: contatoAlvo.id,
          para: contatoAlvo.email.trim().toLowerCase(),
          assunto: renderResult.assunto,
          corpo_html: renderResult.corpoHtml,
          corpo_texto: renderResult.corpoTexto,
          status: statusFila,
          agendado_para: inscricao.proximo_envio_em || agora.toISOString(),
        });

        // Atualiza a inscrição para evitar nova seleção enquanto aguarda envio
        await supabaseAdmin
          .from('inscricoes')
          .update({
            // Empurra temporariamente o proximo_envio_em para frente para não ser reprocessado nesta fase
            proximo_envio_em: new Date(agora.getTime() + 24 * 60 * 60 * 1000).toISOString(),
            atualizado_em: new Date().toISOString(),
          })
          .eq('id', inscricao.id);

        inscricoesProcessadas++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        erros.push(`Exceção ao processar inscrição ${inscricao.id}: ${msg}`);
      }
    }
  }

  // 3. PARTE B: Disparar itens aprovados da fila
  const { data: filaAprovados, error: filaErr } = await supabaseAdmin.rpc(
    'obter_fila_envios_aprovados_para_envio',
    { p_limite: limite }
  );

  if (filaErr) {
    erros.push(`Erro ao obter fila de envios aprovados: ${filaErr.message}`);
  } else if (filaAprovados && filaAprovados.length > 0) {
    for (const item of filaAprovados as FilaEnvio[]) {
      try {
        // Carrega dados da inscrição
        const { data: inscricao } = await supabaseAdmin
          .from('inscricoes')
          .select('*')
          .eq('id', item.inscricao_id)
          .single();

        if (!inscricao || inscricao.status !== 'ativa') {
          // Inscrição cancelada ou inexistente: descarta item
          await supabaseAdmin
            .from('fila_envios')
            .update({
              status: 'descartado',
              erro: `Inscrição não está mais ativa (${inscricao?.status || 'inexistente'})`,
            })
            .eq('id', item.id);
          continue;
        }

        // Carrega passo
        const { data: passo } = await supabaseAdmin
          .from('sequencia_passos')
          .select('*')
          .eq('id', item.passo_id)
          .single();

        // Parâmetros de resposta (threading: In-Reply-To e References)
        let emRespostaA: { threadId?: string | null; rfcMessageId?: string | null } | undefined = undefined;
        if (passo && passo.tipo === 'email_resposta') {
          emRespostaA = {
            threadId: inscricao.thread_id,
            rfcMessageId: inscricao.ultimo_rfc_message_id || inscricao.rfc_message_id_inicial,
          };
        }

        // Disparo real via Brevo API
        const resultadoEnvio = await enviarEmail({
          caixaId: inscricao.caixa_envio_id,
          para: item.para,
          assunto: item.assunto,
          html: item.corpo_html,
          texto: item.corpo_texto,
          escolaId: inscricao.escola_id,
          contatoId: item.contato_id,
          emRespostaA,
        });

        // Sucesso no envio: atualiza fila
        await supabaseAdmin
          .from('fila_envios')
          .update({
            status: 'enviado',
            enviado_em: new Date().toISOString(),
          })
          .eq('id', item.id);

        // Atualiza a inscrição e calcula o próximo passo
        const ordemAtual = passo ? passo.ordem : (inscricao.passo_atual || 0) + 1;
        const threadIdFinal = inscricao.thread_id || resultadoEnvio.provedorThreadId;
        const rfcInicialFinal = inscricao.rfc_message_id_inicial || resultadoEnvio.rfcMessageId;

        // Busca o próximo passo para calcular os dias até o próximo envio
        const { data: proximoPassoList } = await supabaseAdmin
          .from('sequencia_passos')
          .select('*')
          .eq('sequencia_id', inscricao.sequencia_id)
          .eq('ordem', ordemAtual + 1)
          .eq('ativo', true);

        const proximoPasso = proximoPassoList && proximoPassoList[0] ? (proximoPassoList[0] as SequenciaPasso) : null;

        let proximoEnvioEm: string | null = null;
        let novoStatusInscricao = 'ativa';

        if (proximoPasso) {
          const dataProximo = agendarProximoPasso(agora, proximoPasso.dias_apos_anterior, feriadosSet);
          proximoEnvioEm = dataProximo.toISOString();
        } else {
          // Último passo enviado: marca como concluída
          novoStatusInscricao = 'concluida';
        }

        await supabaseAdmin
          .from('inscricoes')
          .update({
            passo_atual: ordemAtual,
            thread_id: threadIdFinal,
            rfc_message_id_inicial: rfcInicialFinal,
            ultimo_rfc_message_id: resultadoEnvio.rfcMessageId,
            proximo_envio_em: proximoEnvioEm,
            status: novoStatusInscricao,
            atualizado_em: new Date().toISOString(),
          })
          .eq('id', inscricao.id);

        // Se for o toque 1, avança o status do funil da escola para 'contato_enviado'
        if (ordemAtual === 1) {
          await supabaseAdmin
            .from('escolas')
            .update({
              status_funil: 'contato_enviado',
              atualizado_em: new Date().toISOString(),
            })
            .eq('id', inscricao.escola_id)
            .in('status_funil', ['novo', 'em_sequencia']);
        }

        enviosRealizados++;

        // Jitter de 2 segundos para o loop local não inundar a API
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        erros.push(`Falha no envio do item ${item.id}: ${msg}`);
        await supabaseAdmin
          .from('fila_envios')
          .update({
            status: 'erro',
            erro: msg,
          })
          .eq('id', item.id);
      }
    }
  }

  return {
    executou: true,
    inscricoesProcessadas,
    enviosRealizados,
    erros,
  };
}

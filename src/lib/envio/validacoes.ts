import { podeEnviarEmail } from './regrasEnvio';

export interface ValidacaoEnvioContext {
  caixa: {
    ativo: boolean;
    email: string;
  };
  limite: {
    podeEnviar: boolean;
    enviadosHojeEfetivo: number;
    limiteHoje: number;
  };
  isTeste?: boolean;
  destinatarioNaListaDescadastro?: boolean;
  contatoDescadastrado?: boolean;
  contatoEmailStatus?: string | null;
  escolaStatusFunil?: string | null;
}

export interface ValidacaoEnvioResult {
  permitido: boolean;
  motivoBloqueio?: string;
}

/**
 * Função pura que centraliza e valida todas as regras de bloqueio de envio:
 * 1. Caixa inativa
 * 2. Limite diário de aquecimento atingido
 * 3. E-mail na lista de descadastro (opt-out)
 * 4. Contato individual marcado como descadastrado
 * 5. Status de verificação de e-mail inválido/rejeitado (pode_enviar)
 * 6. Escola em status de funil 'descadastrado' ou 'sem_interesse'
 */
export function validarRegrasDeEnvio(ctx: ValidacaoEnvioContext): ValidacaoEnvioResult {
  // 1. Verificação da caixa
  if (!ctx.caixa.ativo) {
    return {
      permitido: false,
      motivoBloqueio: `A caixa de envio (${ctx.caixa.email}) está inativa.`,
    };
  }

  // 2. Limite de aquecimento diário
  if (!ctx.limite.podeEnviar) {
    return {
      permitido: false,
      motivoBloqueio: `Limite diário de aquecimento atingido para ${ctx.caixa.email} (${ctx.limite.enviadosHojeEfetivo}/${ctx.limite.limiteHoje} e-mails hoje).`,
    };
  }

  // Se for e-mail de teste disparado pelo administrador em /configuracoes/email, ignora travas de lead
  if (ctx.isTeste) {
    return { permitido: true };
  }

  // 3. Destinatário na lista de descadastros
  if (ctx.destinatarioNaListaDescadastro) {
    return {
      permitido: false,
      motivoBloqueio: 'Envio bloqueado: O e-mail está na lista de descadastro (opt-out).',
    };
  }

  // 4. Contato descadastrado
  if (ctx.contatoDescadastrado) {
    return {
      permitido: false,
      motivoBloqueio: 'Envio bloqueado: O contato está marcado como descadastrado.',
    };
  }

  // 5. Validação de elegibilidade do e-mail (Etapa 6)
  if (ctx.contatoEmailStatus !== undefined && ctx.contatoEmailStatus !== null) {
    if (!podeEnviarEmail(ctx.contatoEmailStatus)) {
      return {
        permitido: false,
        motivoBloqueio: `Envio bloqueado: Status de verificação do e-mail não permite envio (${ctx.contatoEmailStatus}).`,
      };
    }
  }

  // 6. Status do funil da escola
  if (ctx.escolaStatusFunil === 'descadastrado') {
    return {
      permitido: false,
      motivoBloqueio: 'Envio bloqueado: A escola está marcada como descadastrada.',
    };
  }

  if (ctx.escolaStatusFunil === 'sem_interesse') {
    return {
      permitido: false,
      motivoBloqueio: 'Envio bloqueado: A escola está marcada como sem interesse.',
    };
  }

  return { permitido: true };
}

import { EmailStatus } from '@/types/database';

export interface RegrasEnvioConfig {
  aceitarStatus?: EmailStatus[];
  aceitarCatchAll?: boolean;
  aceitarArriscado?: boolean;
}

const CONFIG_PADRAO: RegrasEnvioConfig = {
  aceitarStatus: ['valido'],
  aceitarCatchAll: false,
  aceitarArriscado: false,
};

/**
 * Avalia se um determinado status de verificação de e-mail pode receber mensagens.
 * Segue as regras estritas da Etapa 6 e do script de regras de envio.
 */
export function podeEnviarEmail(
  status?: string | null,
  config: RegrasEnvioConfig = CONFIG_PADRAO
): boolean {
  if (!status) return false;

  const s = status.trim().toLowerCase();

  if (s === 'valido') {
    return config.aceitarStatus?.includes('valido') ?? true;
  }
  if (s === 'catch_all') {
    return Boolean(config.aceitarCatchAll || config.aceitarStatus?.includes('catch_all'));
  }
  if (s === 'arriscado') {
    return Boolean(config.aceitarArriscado || config.aceitarStatus?.includes('arriscado'));
  }

  // 'invalido', 'nao_verificado', 'desconhecido' ou qualquer outro são sempre rejeitados
  return false;
}

import fs from 'fs';
import path from 'path';

export interface EnvioConfig {
  aceitar_status: string[];
  aceitar_catch_all: boolean;
  aceitar_arriscado: boolean;
}

export const DEFAULT_ENVIO_CONFIG: EnvioConfig = {
  aceitar_status: ['valido'],
  aceitar_catch_all: false,
  aceitar_arriscado: false,
};

export function carregarConfigEnvio(): EnvioConfig {
  try {
    const configPath = path.resolve(process.cwd(), 'scripts/config/envio.json');
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(content) as EnvioConfig;
    }
  } catch {
    // Retorna configuração padrão caso o arquivo não seja acessível
  }
  return DEFAULT_ENVIO_CONFIG;
}

/**
 * Determina se um endereço com determinado status de verificação é elegível para envio.
 */
export function podeEnviar(emailStatus?: string | null, customConfig?: EnvioConfig): boolean {
  if (!emailStatus) return false;
  const cfg = customConfig || carregarConfigEnvio();
  const status = emailStatus.trim().toLowerCase();

  if (status === 'valido') {
    return cfg.aceitar_status.includes('valido');
  }
  if (status === 'catch_all') {
    return Boolean(cfg.aceitar_catch_all || cfg.aceitar_status.includes('catch_all'));
  }
  if (status === 'arriscado') {
    return Boolean(cfg.aceitar_arriscado || cfg.aceitar_status.includes('arriscado'));
  }
  return false;
}

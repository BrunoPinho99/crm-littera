import { describe, it, expect } from 'vitest';
import { podeEnviar } from '@/lib/regras/envio';
import { podeEnviarEmail } from '@/lib/envio/regrasEnvio';

describe('pode_enviar e regras de envio (src/lib/regras/envio.ts e src/lib/envio/regrasEnvio.ts)', () => {
  it('podeEnviar: deve aprovar e-mail estritamente valido na configuração padrão', () => {
    expect(podeEnviar('valido')).toBe(true);
  });

  it('podeEnviar: deve rejeitar status não seguros na configuração padrão', () => {
    expect(podeEnviar('invalido')).toBe(false);
    expect(podeEnviar('arriscado')).toBe(false);
    expect(podeEnviar('catch_all')).toBe(false);
    expect(podeEnviar('nao_verificado')).toBe(false);
    expect(podeEnviar('desconhecido')).toBe(false);
    expect(podeEnviar(null)).toBe(false);
    expect(podeEnviar(undefined)).toBe(false);
    expect(podeEnviar('')).toBe(false);
  });

  it('podeEnviar: deve respeitar configurações personalizadas quando fornecidas', () => {
    const cfgPermissiva = {
      aceitar_status: ['valido', 'catch_all', 'arriscado'],
      aceitar_catch_all: true,
      aceitar_arriscado: true,
    };
    expect(podeEnviar('valido', cfgPermissiva)).toBe(true);
    expect(podeEnviar('catch_all', cfgPermissiva)).toBe(true);
    expect(podeEnviar('arriscado', cfgPermissiva)).toBe(true);
    expect(podeEnviar('invalido', cfgPermissiva)).toBe(false);
  });

  it('podeEnviarEmail (src/lib/envio/regrasEnvio.ts): comportamento idêntico e consistente', () => {
    expect(podeEnviarEmail('valido')).toBe(true);
    expect(podeEnviarEmail('invalido')).toBe(false);
    expect(podeEnviarEmail('arriscado')).toBe(false);
    expect(podeEnviarEmail('catch_all')).toBe(false);
    expect(podeEnviarEmail(null)).toBe(false);
    expect(podeEnviarEmail(undefined)).toBe(false);
  });
});

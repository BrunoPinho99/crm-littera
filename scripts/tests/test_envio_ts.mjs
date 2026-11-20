import assert from 'node:assert';

console.log('--- Executando testes de regras de envio em TypeScript (podeEnviar) ---');

const { podeEnviar } = await import('../../src/lib/regras/envio.ts');

// 1. Configuração padrão
assert.strictEqual(podeEnviar('valido'), true, 'Valido deve ser aceito');
assert.strictEqual(podeEnviar('invalido'), false, 'Invalido deve ser rejeitado');
assert.strictEqual(podeEnviar('arriscado'), false, 'Arriscado deve ser rejeitado por padrao');
assert.strictEqual(podeEnviar('catch_all'), false, 'Catch-all deve ser rejeitado por padrao');
assert.strictEqual(podeEnviar('nao_verificado'), false, 'Nao verificado deve ser rejeitado');
assert.strictEqual(podeEnviar('desconhecido'), false, 'Desconhecido deve ser rejeitado');
assert.strictEqual(podeEnviar(null), false, 'Nulo deve ser rejeitado');

// 2. Configuração customizada permissiva
const cfgPermissiva = {
  aceitar_status: ['valido', 'catch_all'],
  aceitar_catch_all: true,
  aceitar_arriscado: true,
};

assert.strictEqual(podeEnviar('valido', cfgPermissiva), true, 'Valido aceito na permissiva');
assert.strictEqual(podeEnviar('catch_all', cfgPermissiva), true, 'Catch-all aceito na permissiva');
assert.strictEqual(podeEnviar('arriscado', cfgPermissiva), true, 'Arriscado aceito na permissiva');
assert.strictEqual(podeEnviar('invalido', cfgPermissiva), false, 'Invalido continua rejeitado');

console.log('✓ Todos os testes de regras de envio TypeScript passaram com sucesso!');

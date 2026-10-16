const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validateProductPayload,
  normalizeProductPayload,
  validateStockMovementPayload,
} = require('../src/validators');

const validProduct = {
  nome: 'Maçã',
  categoria: 'Fruta',
  codigo_lote: 'L20260830-01',
  data_validade: '2026-09-05',
  data_entrada: '2026-08-30',
  preco_unitario: 7.5,
  quantidade_estoque: 40,
};

test('validateProductPayload accepts a complete create payload', () => {
  assert.equal(validateProductPayload(validProduct), null);
});

test('validateProductPayload rejects a missing required field', () => {
  const { nome, ...withoutNome } = validProduct;
  assert.match(validateProductPayload(withoutNome), /nome/);
});

test('validateProductPayload rejects a malformed date', () => {
  const payload = { ...validProduct, data_validade: '05/09/2026' };
  assert.match(validateProductPayload(payload), /data_validade/);
});

test('validateProductPayload rejects an impossible calendar date', () => {
  const payload = { ...validProduct, data_validade: '2026-02-31' };
  assert.match(validateProductPayload(payload), /data_validade/);
  assert.match(validateProductPayload({ ...validProduct, data_entrada: '2026-02-30' }), /data_entrada/);
});

test('validateProductPayload rejects an expiration date before the entry date', () => {
  const payload = { ...validProduct, data_entrada: '2026-06-01', data_validade: '2026-01-01' };
  assert.match(validateProductPayload(payload), /anterior/);
});

test('validateProductPayload accepts an expiration date equal to the entry date', () => {
  const payload = { ...validProduct, data_entrada: '2026-09-05', data_validade: '2026-09-05' };
  assert.equal(validateProductPayload(payload), null);
});

test('validateProductPayload rejects a negative price', () => {
  const payload = { ...validProduct, preco_unitario: -1 };
  assert.match(validateProductPayload(payload), /preco_unitario/);
});

test('validateProductPayload rejects a non-integer stock quantity on create', () => {
  const payload = { ...validProduct, quantidade_estoque: 1.5 };
  assert.match(validateProductPayload(payload), /quantidade_estoque/);
});

test('validateProductPayload does not require quantidade_estoque on update', () => {
  const { quantidade_estoque, ...updatePayload } = validProduct;
  assert.equal(validateProductPayload(updatePayload, { isUpdate: true }), null);
});

test('normalizeProductPayload trims strings and coerces numbers', () => {
  const normalized = normalizeProductPayload({ ...validProduct, nome: '  Maçã  ' });
  assert.equal(normalized.nome, 'Maçã');
  assert.equal(normalized.preco_unitario, 7.5);
  assert.equal(normalized.quantidade_estoque, 40);
  assert.equal(normalized.perecivel, true);
});

test('normalizeProductPayload leaves omitted quantidade_minima and localizacao undefined on update', () => {
  const { quantidade_estoque, ...updatePayload } = validProduct;
  const normalized = normalizeProductPayload(updatePayload, { isUpdate: true });
  assert.equal(normalized.quantidade_minima, undefined);
  assert.equal(normalized.localizacao, undefined);
});

test('normalizeProductPayload keeps sent quantidade_minima and turns an empty localizacao into null', () => {
  const normalized = normalizeProductPayload({ ...validProduct, quantidade_minima: 20, localizacao: '  ' });
  assert.equal(normalized.quantidade_minima, 20);
  assert.equal(normalized.localizacao, null);
});

test('validateStockMovementPayload accepts a positive integer quantity', () => {
  assert.equal(validateStockMovementPayload({ quantidade: 5 }), null);
});

test('validateStockMovementPayload rejects zero or negative quantity', () => {
  assert.match(validateStockMovementPayload({ quantidade: 0 }), /quantidade/);
  assert.match(validateStockMovementPayload({ quantidade: -3 }), /quantidade/);
});

test('validateStockMovementPayload requires a known subtipo for exits when required', () => {
  assert.match(validateStockMovementPayload({ quantidade: 5 }, { requireSubtipo: true }), /subtipo/);
  assert.equal(validateStockMovementPayload({ quantidade: 5, subtipo: 'venda' }, { requireSubtipo: true }), null);
});

test('validateStockMovementPayload rejects an unknown subtipo', () => {
  assert.match(validateStockMovementPayload({ quantidade: 5, subtipo: 'furto' }), /subtipo/);
});

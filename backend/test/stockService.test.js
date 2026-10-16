const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../src/database');
const movementRepository = require('../src/repositories/movementRepository');
const stockService = require('../src/services/stockService');
const { STATUS_IDS } = require('../src/productStatus');
const { BusinessRuleError, ValidationError, NotFoundError } = require('../src/errors');
const { prepareStock } = require('./helpers/stockMocks');

test('stock entry increases the balance and records its before and after quantities', async (t) => {
  const state = prepareStock(t);
  const product = await stockService.registerStockEntry(7, { quantidade: 4, motivo: 'Reposição' });

  assert.equal(product.quantidade_estoque, 14);
  assert.equal(state.statusId, STATUS_IDS.ATIVO);
  assert.deepEqual(state.movements, [{
    productId: 7, type: 'entrada', subtype: null, quantity: 4,
    previousQuantity: 10, currentQuantity: 14, reason: 'Reposição',
  }]);
});

test('a valid sale reduces the balance and records the sale subtype', async (t) => {
  const state = prepareStock(t);
  const product = await stockService.registerStockExit(7, { quantidade: 3, subtipo: 'venda', motivo: 'Venda' });

  assert.equal(product.quantidade_estoque, 7);
  assert.deepEqual(state.movements, [{
    productId: 7, type: 'saida', subtype: 'venda', quantity: 3,
    previousQuantity: 10, currentQuantity: 7, reason: 'Venda',
  }]);
});

test('selling the remaining stock marks the product as out of stock', async (t) => {
  const state = prepareStock(t);
  await stockService.registerStockExit(7, { quantidade: 10, subtipo: 'venda' });
  assert.equal(state.quantity, 0);
  assert.equal(state.statusId, STATUS_IDS.ESGOTADO);
});

test('an expired sale is rejected before changing stock, status or history', async (t) => {
  const state = prepareStock(t, { expirationDate: '2000-01-01' });
  await assert.rejects(stockService.registerStockExit(7, { quantidade: 2, subtipo: 'venda' }), BusinessRuleError);
  assert.equal(state.quantity, 10);
  assert.equal(state.writes, 0);
});

test('an exit above the available balance is rejected without writing', async (t) => {
  const state = prepareStock(t);
  await assert.rejects(stockService.registerStockExit(7, { quantidade: 11, subtipo: 'perda' }), ValidationError);
  assert.equal(state.quantity, 10);
  assert.equal(state.writes, 0);
});

test('expired products can still be removed as a loss', async (t) => {
  const state = prepareStock(t, { expirationDate: '2000-01-01' });
  await stockService.registerStockExit(7, { quantidade: 2, subtipo: 'perda' });
  assert.equal(state.quantity, 8);
  assert.equal(state.statusId, STATUS_IDS.VENCIDO);
  assert.equal(state.movements[0].subtype, 'perda');
});

test('stock movements for a missing product are rejected before writing', async (t) => {
  const state = prepareStock(t, { missing: true });
  await assert.rejects(stockService.registerStockEntry(7, { quantidade: 1 }), NotFoundError);
  await assert.rejects(stockService.registerStockExit(7, { quantidade: 1, subtipo: 'venda' }), NotFoundError);
  assert.equal(state.writes, 0);
});

test('a movement persistence failure reaches the transaction boundary', async (t) => {
  prepareStock(t);
  const failure = new Error('History write failed');
  t.mock.method(movementRepository, 'insertMovement', async () => { throw failure; });
  await assert.rejects(stockService.registerStockEntry(7, { quantidade: 1 }), (error) => error === failure);
});

test('stock summaries derive the low stock and expiration alert fields from the stored rows', async (t) => {
  t.mock.method(database, 'initDatabase', async () => ({
    execute: async () => [[
      { id: 1, status: 'ativo', data_validade: '2000-01-01', quantidade_estoque: 2, quantidade_minima: 2 },
      { id: 2, status: 'ativo', data_validade: '2099-01-01', quantidade_estoque: 10, quantidade_minima: 2 },
    ]],
  }));
  const [expiredProduct, availableProduct] = await stockService.getStockSummary();
  assert.equal(expiredProduct.status, 'vencido');
  assert.equal(expiredProduct.estoque_baixo, true);
  assert.equal(expiredProduct.proximo_do_vencimento, false);
  assert.ok(expiredProduct.dias_para_vencer < 0);
  assert.equal(availableProduct.status, 'ativo');
  assert.equal(availableProduct.estoque_baixo, false);
  assert.equal(availableProduct.proximo_do_vencimento, false);
});

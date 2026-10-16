const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../src/database');
const productRepository = require('../src/repositories/productRepository');
const stockRepository = require('../src/repositories/stockRepository');
const movementRepository = require('../src/repositories/movementRepository');
const batchService = require('../src/services/batchService');
const stockService = require('../src/services/stockService');
const { BusinessRuleError, ValidationError, NotFoundError } = require('../src/errors');
const { MOCK_BATCH_ID, createBatch, prepareStock } = require('./helpers/stockMocks');

test('stock entry increases the balance and records its before and after quantities', async (t) => {
  const state = prepareStock(t);
  const product = await stockService.registerStockEntry(7, { quantidade: 4, motivo: 'Reposição' });

  assert.equal(product.quantidade_estoque, 14);
  assert.equal(state.quantity, 14);
  assert.equal(product.status, 'ativo');
  assert.deepEqual(state.movements, [{
    productId: 7, batchId: MOCK_BATCH_ID, type: 'entrada', subtype: null, quantity: 4,
    previousQuantity: 10, currentQuantity: 14, reason: 'Reposição',
  }]);
});

test('stock entry with a batch code goes to that batch', async (t) => {
  const state = prepareStock(t);
  state.batches.push(createBatch(4, '2099-06-01', 0));
  t.mock.method(batchService, 'ensureBatch', async (executor, batch) => {
    assert.equal(batch.batchCode, 'B-4');
    return { id: 4, codigo_lote: 'B-4', data_validade: '2099-06-01' };
  });

  await stockService.registerStockEntry(7, { quantidade: 6, codigoLote: 'B-4' });
  assert.equal(state.batches.find((batch) => batch.lote_id === 4).quantidade, 6);
  assert.equal(state.movements[0].batchId, 4);
});

test('stock entry into an expired batch is rejected without writing', async (t) => {
  const state = prepareStock(t, { expirationDate: '2000-01-01' });
  await assert.rejects(stockService.registerStockEntry(7, { quantidade: 1 }), BusinessRuleError);
  assert.equal(state.writes, 0);
});

test('a valid sale reduces the balance and records the sale subtype', async (t) => {
  const state = prepareStock(t);
  const product = await stockService.registerStockExit(7, { quantidade: 3, subtipo: 'venda', motivo: 'Venda' });

  assert.equal(product.quantidade_estoque, 7);
  assert.deepEqual(state.movements, [{
    productId: 7, batchId: MOCK_BATCH_ID, type: 'saida', subtype: 'venda', quantity: 3,
    previousQuantity: 10, currentQuantity: 7, reason: 'Venda',
  }]);
});

test('a sale consumes the earliest-expiring batch first and records one movement per batch', async (t) => {
  // Acceptance scenario RF-09: batch A (10 units, expires first) and batch B (30 units).
  const state = prepareStock(t, { batches: [createBatch(2, '2099-01-09', 30), createBatch(1, '2099-01-02', 10)] });
  await stockService.registerStockExit(7, { quantidade: 15, subtipo: 'venda' });

  assert.deepEqual(state.batches.map(({ lote_id, quantidade }) => [lote_id, quantidade]), [[2, 25], [1, 0]]);
  assert.deepEqual(
    state.movements.map(({ batchId, quantity, previousQuantity, currentQuantity }) => [batchId, quantity, previousQuantity, currentQuantity]),
    [[1, 10, 40, 30], [2, 5, 30, 25]]
  );
  assert.equal(state.quantity, 25);
});

test('a sale skips expired batches and uses the valid ones', async (t) => {
  const state = prepareStock(t, { batches: [createBatch(1, '2000-01-01', 10), createBatch(2, '2099-01-09', 30)] });
  const product = await stockService.registerStockExit(7, { quantidade: 15, subtipo: 'venda' });

  assert.deepEqual(state.batches.map(({ quantidade }) => quantidade), [10, 15]);
  assert.equal(product.quantidade_vencida, 10);
  assert.equal(product.status, 'ativo');
});

test('selling the remaining stock marks the product as out of stock', async (t) => {
  const state = prepareStock(t);
  const product = await stockService.registerStockExit(7, { quantidade: 10, subtipo: 'venda' });
  assert.equal(state.quantity, 0);
  assert.equal(product.status, 'esgotado');
});

test('an expired sale is rejected before changing stock, status or history', async (t) => {
  const state = prepareStock(t, { expirationDate: '2000-01-01' });
  await assert.rejects(stockService.registerStockExit(7, { quantidade: 2, subtipo: 'venda' }), BusinessRuleError);
  assert.equal(state.quantity, 10);
  assert.equal(state.writes, 0);
});

test('an inactive product cannot be sold', async (t) => {
  const state = prepareStock(t, { status: 'inativo' });
  await assert.rejects(stockService.registerStockExit(7, { quantidade: 2, subtipo: 'venda' }), /inativo/);
  assert.equal(state.writes, 0);
});

test('an exit above the available balance is rejected without writing', async (t) => {
  const state = prepareStock(t);
  await assert.rejects(stockService.registerStockExit(7, { quantidade: 11, subtipo: 'perda' }), ValidationError);
  assert.equal(state.quantity, 10);
  assert.equal(state.writes, 0);
});

test('an exit from an unknown batch code is rejected without writing', async (t) => {
  const state = prepareStock(t);
  await assert.rejects(
    stockService.registerStockExit(7, { quantidade: 1, subtipo: 'perda', codigoLote: 'B-99' }),
    NotFoundError
  );
  assert.equal(state.writes, 0);
});

test('expired products can still be removed as a loss', async (t) => {
  const state = prepareStock(t, { expirationDate: '2000-01-01' });
  const product = await stockService.registerStockExit(7, { quantidade: 2, subtipo: 'perda' });
  assert.equal(state.quantity, 8);
  assert.equal(product.status, 'vencido');
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

test('stock summaries include inactive products and derive alert fields from their batches', async (t) => {
  const executor = {};
  t.mock.method(database, 'initDatabase', async () => executor);
  const listProducts = t.mock.method(productRepository, 'listProducts', async () => [
    { id: 1, status: 'ativo', quantidade_minima: 2 },
    { id: 2, status: 'ativo', quantidade_minima: 2 },
  ]);
  t.mock.method(stockRepository, 'listBatchStock', async () => [
    { produto_id: 1, lote_id: 1, codigo_lote: 'B-1', data_entrada: null, data_validade: '2000-01-01', quantidade: 2 },
    { produto_id: 2, lote_id: 2, codigo_lote: 'B-2', data_entrada: null, data_validade: '2099-01-01', quantidade: 10 },
  ]);

  const [expiredProduct, availableProduct] = await stockService.getStockSummary();
  assert.deepEqual(listProducts.mock.calls[0].arguments, [executor, { includeInactive: true }]);
  assert.equal(expiredProduct.status, 'vencido');
  assert.equal(expiredProduct.estoque_baixo, true);
  assert.equal(expiredProduct.proximo_do_vencimento, false);
  assert.ok(expiredProduct.dias_para_vencer < 0);
  assert.equal(availableProduct.status, 'ativo');
  assert.equal(availableProduct.estoque_baixo, false);
  assert.equal(availableProduct.proximo_do_vencimento, false);
});

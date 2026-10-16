const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../src/database');
const productRepository = require('../src/repositories/productRepository');
const stockRepository = require('../src/repositories/stockRepository');
const movementRepository = require('../src/repositories/movementRepository');
const stockService = require('../src/services/stockService');
const { STATUS_IDS } = require('../src/productStatus');
const { BusinessRuleError, ValidationError, NotFoundError } = require('../src/errors');

function prepareStock(t, { quantity = 10, expirationDate = '2099-01-01', missing = false } = {}) {
  const connection = {};
  const state = { quantity, statusId: STATUS_IDS.ATIVO, movements: [], writes: 0 };
  t.mock.method(database, 'withTransaction', (callback) => callback(connection));
  t.mock.method(stockRepository, 'lockProductStock', async (executor, productId) => {
    assert.equal(executor, connection);
    assert.equal(productId, 7);
    return missing ? null : { id: 7, quantidade: state.quantity, data_validade: expirationDate };
  });
  t.mock.method(stockRepository, 'updateQuantity', async (executor, productId, newQuantity) => {
    assert.equal(executor, connection);
    assert.equal(productId, 7);
    state.quantity = newQuantity;
    state.writes += 1;
  });
  t.mock.method(productRepository, 'updateProductStatus', async (executor, productId, statusId) => {
    assert.equal(executor, connection);
    assert.equal(productId, 7);
    state.statusId = statusId;
    state.writes += 1;
  });
  t.mock.method(movementRepository, 'insertMovement', async (executor, movement) => {
    assert.equal(executor, connection);
    state.movements.push(movement);
    state.writes += 1;
  });
  t.mock.method(productRepository, 'findProductById', async (productId, executor) => {
    assert.equal(executor, connection);
    return { id: productId, quantidade_estoque: state.quantity, status_id: state.statusId };
  });
  return state;
}

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

test('stock summaries preserve the low stock and expiration alert fields', async (t) => {
  t.mock.method(productRepository, 'listProducts', async () => [
    { id: 1, data_validade: '2000-01-01', quantidade_estoque: 2, quantidade_minima: 2 },
    { id: 2, data_validade: '2099-01-01', quantidade_estoque: 10, quantidade_minima: 2 },
  ]);
  const [expiredProduct, availableProduct] = await stockService.getStockSummary();
  assert.equal(expiredProduct.estoque_baixo, true);
  assert.equal(expiredProduct.proximo_do_vencimento, true);
  assert.ok(expiredProduct.dias_para_vencer < 0);
  assert.equal(availableProduct.estoque_baixo, false);
  assert.equal(availableProduct.proximo_do_vencimento, false);
});

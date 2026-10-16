const assert = require('node:assert/strict');
const database = require('../../src/database');
const productRepository = require('../../src/repositories/productRepository');
const stockRepository = require('../../src/repositories/stockRepository');
const movementRepository = require('../../src/repositories/movementRepository');

const MOCK_PRODUCT_ID = 7;
const MOCK_BATCH_ID = 3;

function createBatch(id, expirationDate, quantity) {
  return {
    produto_id: MOCK_PRODUCT_ID,
    lote_id: id,
    codigo_lote: `B-${id}`,
    data_entrada: '2000-01-01',
    data_validade: expirationDate,
    quantidade: quantity,
  };
}

// In-memory product with batch balances. `writes` counts every persisted change, so tests can
// assert that a rejected movement wrote nothing.
function prepareStock(
  t,
  { quantity = 10, expirationDate = '2099-01-01', batches, status = 'ativo', missing = false } = {}
) {
  const connection = {};
  const state = {
    batches: batches || [createBatch(MOCK_BATCH_ID, expirationDate, quantity)],
    quantity: null,
    movements: [],
    writes: 0,
  };
  state.quantity = state.batches.reduce((total, batch) => total + batch.quantidade, 0);

  const findBatch = (batchId) => state.batches.find((batch) => batch.lote_id === batchId);

  t.mock.method(database, 'withTransaction', (callback) => callback(connection));
  t.mock.method(productRepository, 'lockProductForUpdate', async (executor, productId) => {
    assert.equal(executor, connection);
    assert.equal(productId, MOCK_PRODUCT_ID);
    return missing ? null : { id: MOCK_PRODUCT_ID, status };
  });
  t.mock.method(stockRepository, 'listProductBatchStock', async (executor, productId) => {
    assert.equal(executor, connection);
    assert.equal(productId, MOCK_PRODUCT_ID);
    return state.batches.map((batch) => ({ ...batch }));
  });
  t.mock.method(stockRepository, 'findLatestProductBatch', async (executor) => {
    assert.equal(executor, connection);
    return [...state.batches].sort((first, second) => second.data_validade.localeCompare(first.data_validade))[0];
  });
  t.mock.method(stockRepository, 'addBatchQuantity', async (executor, productId, batchId, amount) => {
    assert.equal(executor, connection);
    findBatch(batchId).quantidade += amount;
    state.writes += 1;
  });
  t.mock.method(stockRepository, 'subtractBatchQuantity', async (executor, productId, batchId, amount) => {
    assert.equal(executor, connection);
    findBatch(batchId).quantidade -= amount;
    state.writes += 1;
  });
  t.mock.method(stockRepository, 'updateQuantity', async (executor, productId, newQuantity) => {
    assert.equal(executor, connection);
    assert.equal(productId, MOCK_PRODUCT_ID);
    state.quantity = newQuantity;
    state.writes += 1;
  });
  t.mock.method(movementRepository, 'insertMovement', async (executor, movement) => {
    assert.equal(executor, connection);
    state.movements.push(movement);
    state.writes += 1;
  });
  t.mock.method(productRepository, 'findProductById', async (productId, executor) => {
    assert.equal(executor, connection);
    return { id: productId, status, quantidade_minima: 0 };
  });
  return state;
}

module.exports = { MOCK_PRODUCT_ID, MOCK_BATCH_ID, createBatch, prepareStock };

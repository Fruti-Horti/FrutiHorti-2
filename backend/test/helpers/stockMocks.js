const assert = require('node:assert/strict');
const database = require('../../src/database');
const productRepository = require('../../src/repositories/productRepository');
const stockRepository = require('../../src/repositories/stockRepository');
const movementRepository = require('../../src/repositories/movementRepository');
const { STATUS_IDS } = require('../../src/productStatus');

const MOCK_PRODUCT_ID = 7;

function prepareStock(t, { quantity = 10, expirationDate = '2099-01-01', missing = false } = {}) {
  const connection = {};
  const state = { quantity, statusId: STATUS_IDS.ATIVO, movements: [], writes: 0 };
  t.mock.method(database, 'withTransaction', (callback) => callback(connection));
  t.mock.method(stockRepository, 'lockProductStock', async (executor, productId) => {
    assert.equal(executor, connection);
    assert.equal(productId, MOCK_PRODUCT_ID);
    return missing ? null : { id: MOCK_PRODUCT_ID, quantidade: state.quantity, data_validade: expirationDate };
  });
  t.mock.method(stockRepository, 'updateQuantity', async (executor, productId, newQuantity) => {
    assert.equal(executor, connection);
    assert.equal(productId, MOCK_PRODUCT_ID);
    state.quantity = newQuantity;
    state.writes += 1;
  });
  t.mock.method(productRepository, 'updateProductStatus', async (executor, productId, statusId) => {
    assert.equal(executor, connection);
    assert.equal(productId, MOCK_PRODUCT_ID);
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

module.exports = { MOCK_PRODUCT_ID, prepareStock };

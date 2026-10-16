const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../src/database');
const productRepository = require('../src/repositories/productRepository');
const stockRepository = require('../src/repositories/stockRepository');
const movementRepository = require('../src/repositories/movementRepository');
const categoryService = require('../src/services/categoryService');
const batchService = require('../src/services/batchService');
const productService = require('../src/services/productService');
const { STATUS_IDS } = require('../src/productStatus');
const { NotFoundError } = require('../src/errors');

const productPayload = {
  nome: 'Maçã', categoria: 'Fruta', codigo_lote: 'B-01', data_validade: '2099-01-01',
  preco_unitario: 7.5, perecivel: true, quantidade_estoque: 8,
};

function prepareProduct(t, { existingQuantity = 5, missing = false } = {}) {
  const connection = {};
  const state = { quantity: existingQuantity, references: null, movements: [], details: null };
  t.mock.method(database, 'withTransaction', (callback) => callback(connection));
  t.mock.method(categoryService, 'ensureCategory', async (executor, categoryName) => {
    assert.equal(executor, connection);
    assert.equal(categoryName, productPayload.categoria);
    return 2;
  });
  t.mock.method(batchService, 'ensureBatch', async (executor, batch) => {
    assert.equal(executor, connection);
    assert.equal(batch.batchCode, productPayload.codigo_lote);
    return 3;
  });
  t.mock.method(productRepository, 'createProduct', async (executor, references) => {
    assert.equal(executor, connection);
    state.references = references;
    return 7;
  });
  t.mock.method(productRepository, 'lockProductForUpdate', async (executor) => {
    assert.equal(executor, connection);
    return missing ? null : { id: 7, quantidade_estoque: state.quantity };
  });
  t.mock.method(productRepository, 'updateProduct', async (executor, productId, references) => {
    assert.equal(executor, connection);
    assert.equal(productId, 7);
    state.references = references;
  });
  t.mock.method(stockRepository, 'createStock', async (executor, productId, stock) => {
    assert.equal(executor, connection);
    assert.equal(productId, 7);
    state.quantity = stock.quantity;
    state.details = stock;
  });
  t.mock.method(stockRepository, 'updateStockDetails', async (executor, productId, details) => {
    assert.equal(executor, connection);
    assert.equal(productId, 7);
    state.details = details;
  });
  t.mock.method(movementRepository, 'insertMovement', async (executor, movement) => {
    assert.equal(executor, connection);
    state.movements.push(movement);
  });
  t.mock.method(productRepository, 'findProductById', async (productId, executor) => {
    assert.equal(executor, connection);
    return { id: productId, quantidade_estoque: state.quantity };
  });
  return state;
}

test('product creation includes its initial stock and movement in one transaction', async (t) => {
  const state = prepareProduct(t);
  const product = await productService.createProduct(productPayload);
  assert.equal(product.quantidade_estoque, 8);
  assert.deepEqual(state.details, { quantity: 8, minimumQuantity: 0, location: null });
  assert.equal(state.references.categoryId, 2);
  assert.equal(state.references.batchId, 3);
  assert.equal(state.references.statusId, STATUS_IDS.ATIVO);
  assert.deepEqual(state.movements, [{
    productId: 7, type: 'entrada', subtype: null, quantity: 8,
    previousQuantity: 0, currentQuantity: 8, reason: 'Cadastro inicial do produto',
  }]);
});

test('zero initial stock creates no movement and marks the product as out of stock', async (t) => {
  const state = prepareProduct(t);
  await productService.createProduct({ ...productPayload, quantidade_estoque: 0 });
  assert.equal(state.quantity, 0);
  assert.equal(state.references.statusId, STATUS_IDS.ESGOTADO);
  assert.deepEqual(state.movements, []);
});

test('editing a product preserves its balance even when a quantity is supplied', async (t) => {
  const state = prepareProduct(t, { existingQuantity: 0 });
  const product = await productService.updateProduct(7, {
    ...productPayload, quantidade_estoque: 99, quantidade_minima: 3, localizacao: 'A1',
  });
  assert.equal(product.quantidade_estoque, 0);
  assert.equal(state.references.statusId, STATUS_IDS.ESGOTADO);
  assert.deepEqual(state.details, { minimumQuantity: 3, location: 'A1' });
  assert.deepEqual(state.movements, []);
});

test('editing a missing product does not create categories, batches or stock', async (t) => {
  const state = prepareProduct(t, { missing: true });
  await assert.rejects(productService.updateProduct(7, productPayload), NotFoundError);
  assert.equal(categoryService.ensureCategory.mock.callCount(), 0);
  assert.equal(batchService.ensureBatch.mock.callCount(), 0);
  assert.equal(state.references, null);
  assert.equal(state.details, null);
});

test('an initial history failure rejects the product creation transaction', async (t) => {
  prepareProduct(t);
  const failure = new Error('Initial movement failed');
  t.mock.method(movementRepository, 'insertMovement', async () => { throw failure; });
  await assert.rejects(productService.createProduct(productPayload), (error) => error === failure);
});

test('fetching and deleting a missing product preserve the not found error', async (t) => {
  t.mock.method(productRepository, 'findProductById', async () => null);
  t.mock.method(productRepository, 'deleteProduct', async () => false);
  await assert.rejects(productService.getProductById(999), NotFoundError);
  await assert.rejects(productService.deleteProduct(999), NotFoundError);
});

test('deleting an existing product returns the original success result', async (t) => {
  t.mock.method(productRepository, 'deleteProduct', async () => true);
  assert.equal(await productService.deleteProduct(7), true);
});

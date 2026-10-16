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
const { NotFoundError, BusinessRuleError } = require('../src/errors');

const productPayload = {
  nome: 'Maçã', categoria: 'Fruta', codigo_lote: 'B-01', data_validade: '2099-01-01',
  preco_unitario: 7.5, perecivel: true, quantidade_estoque: 8,
};

function prepareProduct(t, { existingQuantity = 5, missing = false, batchExpiration = '2099-01-01', movementCount = 0 } = {}) {
  const connection = {};
  const state = {
    quantity: existingQuantity,
    references: null,
    movements: [],
    details: null,
    statusId: null,
    deleted: false,
  };
  t.mock.method(database, 'withTransaction', (callback) => callback(connection));
  t.mock.method(categoryService, 'ensureCategory', async (executor, categoryName) => {
    assert.equal(executor, connection);
    assert.equal(categoryName, productPayload.categoria);
    return 2;
  });
  t.mock.method(batchService, 'ensureBatch', async (executor, batch) => {
    assert.equal(executor, connection);
    assert.equal(batch.batchCode, productPayload.codigo_lote);
    return { id: 3, codigo_lote: batch.batchCode, data_validade: batchExpiration };
  });
  t.mock.method(productRepository, 'createProduct', async (executor, references) => {
    assert.equal(executor, connection);
    state.references = references;
    return 7;
  });
  t.mock.method(productRepository, 'lockProductForUpdate', async (executor) => {
    assert.equal(executor, connection);
    return missing ? null : { id: 7, status: 'ativo' };
  });
  t.mock.method(productRepository, 'updateProduct', async (executor, productId, references) => {
    assert.equal(executor, connection);
    assert.equal(productId, 7);
    state.references = references;
  });
  t.mock.method(productRepository, 'updateProductStatus', async (executor, productId, statusId) => {
    assert.equal(executor, connection);
    state.statusId = statusId;
  });
  t.mock.method(productRepository, 'deleteProduct', async (executor) => {
    assert.equal(executor, connection);
    state.deleted = true;
    return true;
  });
  t.mock.method(stockRepository, 'createStock', async (executor, productId, stock) => {
    assert.equal(executor, connection);
    assert.equal(productId, 7);
    state.details = stock;
  });
  t.mock.method(stockRepository, 'addBatchQuantity', async (executor, productId, batchId, quantity) => {
    assert.equal(executor, connection);
    assert.equal(batchId, 3);
    state.quantity = quantity;
  });
  t.mock.method(stockRepository, 'updateStockDetails', async (executor, productId, details) => {
    assert.equal(executor, connection);
    assert.equal(productId, 7);
    state.details = details;
  });
  t.mock.method(stockRepository, 'listProductBatchStock', async () => [
    { produto_id: 7, lote_id: 3, codigo_lote: 'B-01', data_entrada: null, data_validade: batchExpiration, quantidade: state.quantity },
  ]);
  t.mock.method(movementRepository, 'insertMovement', async (executor, movement) => {
    assert.equal(executor, connection);
    state.movements.push(movement);
  });
  t.mock.method(movementRepository, 'countMovements', async () => movementCount);
  t.mock.method(productRepository, 'findProductById', async (productId, executor) => {
    assert.equal(executor, connection);
    return { id: productId, status: 'ativo', quantidade_minima: 0 };
  });
  return state;
}

test('product creation includes its initial stock, batch balance and movement in one transaction', async (t) => {
  const state = prepareProduct(t);
  const product = await productService.createProduct(productPayload);
  assert.equal(product.quantidade_estoque, 8);
  assert.equal(product.codigo_lote, 'B-01');
  assert.deepEqual(state.details, { quantity: 8, minimumQuantity: 0, location: null });
  assert.equal(state.references.categoryId, 2);
  assert.equal(state.references.statusId, STATUS_IDS.ATIVO);
  assert.deepEqual(state.movements, [{
    productId: 7, batchId: 3, type: 'entrada', subtype: null, quantity: 8,
    previousQuantity: 0, currentQuantity: 8, reason: 'Cadastro inicial do produto',
  }]);
});

test('zero initial stock creates no movement and shows the product as out of stock', async (t) => {
  const state = prepareProduct(t);
  const product = await productService.createProduct({ ...productPayload, quantidade_estoque: 0 });
  assert.equal(state.quantity, 0);
  assert.equal(product.status, 'esgotado');
  assert.deepEqual(state.movements, []);
});

test('creating a product with initial stock in an expired batch is rejected', async (t) => {
  const state = prepareProduct(t, { batchExpiration: '2000-01-01' });
  await assert.rejects(productService.createProduct(productPayload), BusinessRuleError);
  assert.equal(state.references, null);
});

test('editing a product preserves its balance and batches even when they are supplied', async (t) => {
  const state = prepareProduct(t, { existingQuantity: 0 });
  const product = await productService.updateProduct(7, {
    ...productPayload, quantidade_estoque: 99, quantidade_minima: 3, localizacao: 'A1',
  });
  assert.equal(product.quantidade_estoque, 0);
  assert.equal(product.status, 'esgotado');
  assert.deepEqual(state.details, { minimumQuantity: 3, location: 'A1' });
  assert.equal(batchService.ensureBatch.mock.callCount(), 0);
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
  const state = prepareProduct(t, { missing: true });
  t.mock.method(productRepository, 'findProductById', async () => null);
  await assert.rejects(productService.getProductById(999, {}), NotFoundError);
  await assert.rejects(productService.deleteProduct(999), NotFoundError);
  assert.equal(state.deleted, false);
});

test('deleting a product with stock history inactivates it and keeps the history', async (t) => {
  const state = prepareProduct(t, { movementCount: 3 });
  assert.deepEqual(await productService.deleteProduct(7), { deleted: false, deactivated: true });
  assert.equal(state.statusId, STATUS_IDS.INATIVO);
  assert.equal(state.deleted, false);
});

test('deleting a product without stock history removes it', async (t) => {
  const state = prepareProduct(t, { movementCount: 0 });
  assert.deepEqual(await productService.deleteProduct(7), { deleted: true, deactivated: false });
  assert.equal(state.deleted, true);
});

test('a product can be inactivated and reactivated', async (t) => {
  const state = prepareProduct(t);
  await productService.setProductActive(7, false);
  assert.equal(state.statusId, STATUS_IDS.INATIVO);
  await productService.setProductActive(7, true);
  assert.equal(state.statusId, STATUS_IDS.ATIVO);
});

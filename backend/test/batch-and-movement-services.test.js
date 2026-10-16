const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../src/database');
const batchRepository = require('../src/repositories/batchRepository');
const categoryRepository = require('../src/repositories/categoryRepository');
const movementRepository = require('../src/repositories/movementRepository');
const productRepository = require('../src/repositories/productRepository');
const batchService = require('../src/services/batchService');
const categoryService = require('../src/services/categoryService');
const movementService = require('../src/services/movementService');
const { NotFoundError } = require('../src/errors');

test('an existing batch is reused with its expiration date updated', async (t) => {
  const connection = {};
  t.mock.method(batchRepository, 'findBatchByCode', async (executor, code) => {
    assert.equal(executor, connection);
    assert.equal(code, 'B-01');
    return { id: 3 };
  });
  const update = t.mock.method(batchRepository, 'updateExpirationDate', async () => {});
  const create = t.mock.method(batchRepository, 'createBatch', async () => 4);
  const batchId = await batchService.ensureBatch(connection, { batchCode: ' B-01 ', expirationDate: '2099-02-01' });
  assert.equal(batchId, 3);
  assert.deepEqual(update.mock.calls[0].arguments, [connection, 3, '2099-02-01']);
  assert.equal(create.mock.callCount(), 0);
});

test('a new batch keeps the supplied entry and expiration dates', async (t) => {
  const connection = {};
  t.mock.method(batchRepository, 'findBatchByCode', async () => null);
  const create = t.mock.method(batchRepository, 'createBatch', async () => 4);
  assert.equal(await batchService.ensureBatch(connection, {
    batchCode: ' B-02 ', entryDate: '2099-01-01', expirationDate: '2099-02-01',
  }), 4);
  assert.deepEqual(create.mock.calls[0].arguments, [connection, {
    batchCode: 'B-02', entryDate: '2099-01-01', expirationDate: '2099-02-01',
  }]);
});

test('a new batch defaults its entry date to the current UTC date', async (t) => {
  t.mock.method(batchRepository, 'findBatchByCode', async () => null);
  const create = t.mock.method(batchRepository, 'createBatch', async () => 4);
  const today = new Date().toISOString().slice(0, 10);
  await batchService.ensureBatch({}, { batchCode: 'B-03', expirationDate: '2099-02-01' });
  assert.equal(create.mock.calls[0].arguments[1].entryDate, today);
});

test('categories are reused by normalized name without creating a duplicate', async (t) => {
  const connection = {};
  t.mock.method(categoryRepository, 'findCategoryByName', async (executor, name) => {
    assert.equal(executor, connection);
    assert.equal(name, 'Fruta');
    return { id: 2 };
  });
  const create = t.mock.method(categoryRepository, 'createCategory', async () => 5);
  assert.equal(await categoryService.ensureCategory(connection, ' Fruta '), 2);
  assert.equal(create.mock.callCount(), 0);
});

test('unknown categories are created using their normalized name', async (t) => {
  const connection = {};
  t.mock.method(categoryRepository, 'findCategoryByName', async () => null);
  const create = t.mock.method(categoryRepository, 'createCategory', async () => 5);
  assert.equal(await categoryService.ensureCategory(connection, ' Verdura '), 5);
  assert.deepEqual(create.mock.calls[0].arguments, [connection, 'Verdura']);
});

test('movement history preserves its rows and uses the same database executor', async (t) => {
  const connection = {};
  const rows = [{ id: 8, tipo: 'saida', subtipo: 'venda', quantidade: 2 }];
  t.mock.method(database, 'initDatabase', async () => connection);
  t.mock.method(productRepository, 'findProductById', async (productId, executor) => {
    assert.equal(executor, connection);
    return { id: productId };
  });
  t.mock.method(movementRepository, 'listMovements', async (productId, executor) => {
    assert.equal(productId, 7);
    assert.equal(executor, connection);
    return rows;
  });
  assert.deepEqual(await movementService.listMovements(7), rows);
});

test('movement history for a missing product returns not found instead of an empty history', async (t) => {
  t.mock.method(database, 'initDatabase', async () => ({}));
  t.mock.method(productRepository, 'findProductById', async () => null);
  const list = t.mock.method(movementRepository, 'listMovements', async () => []);
  await assert.rejects(movementService.listMovements(999), NotFoundError);
  assert.equal(list.mock.callCount(), 0);
});

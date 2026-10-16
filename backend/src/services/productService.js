const database = require('../database');
const productRepository = require('../repositories/productRepository');
const stockRepository = require('../repositories/stockRepository');
const movementRepository = require('../repositories/movementRepository');
const categoryService = require('./categoryService');
const batchService = require('./batchService');
const movementService = require('./movementService');
const { STATUS_IDS, describeProduct } = require('../productStatus');
const { assertStockEntryAllowed } = require('../stockRules');
const { NotFoundError } = require('../errors');

function groupBatchesByProduct(batchRows) {
  const batchesByProduct = new Map();
  for (const row of batchRows) {
    const productBatches = batchesByProduct.get(row.produto_id) || [];
    productBatches.push(row);
    batchesByProduct.set(row.produto_id, productBatches);
  }
  return batchesByProduct;
}

// The public catalog hides inactive products; the stock screen lists them so they can be reactivated.
async function listProducts({ includeInactive = false } = {}) {
  const executor = await database.initDatabase();
  const rows = await productRepository.listProducts(executor, { includeInactive });
  const batchesByProduct = groupBatchesByProduct(await stockRepository.listBatchStock(executor));
  return rows.map((row) => describeProduct(row, batchesByProduct.get(row.id) || []));
}

async function getProductById(productId, connection) {
  const executor = connection || (await database.initDatabase());
  const product = await productRepository.findProductById(productId, executor);
  if (!product) {
    throw new NotFoundError('Produto não encontrado');
  }

  const batches = await stockRepository.listProductBatchStock(executor, productId);
  return describeProduct(product, batches);
}

async function lockExistingProduct(connection, productId) {
  const product = await productRepository.lockProductForUpdate(connection, productId);
  if (!product) {
    throw new NotFoundError('Produto não encontrado');
  }
  return product;
}

async function createProduct(payload) {
  return database.withTransaction(async (connection) => {
    const quantity = payload.quantidade_estoque;
    const categoryId = await categoryService.ensureCategory(connection, payload.categoria);
    const batch = await batchService.ensureBatch(connection, {
      batchCode: payload.codigo_lote,
      expirationDate: payload.data_validade,
      entryDate: payload.data_entrada,
    });

    if (quantity > 0) {
      assertStockEntryAllowed(batch);
    }

    const productId = await productRepository.createProduct(connection, {
      payload,
      categoryId,
      statusId: STATUS_IDS.ATIVO,
    });
    await stockRepository.createStock(connection, productId, {
      quantity,
      minimumQuantity: payload.quantidade_minima ?? 0,
      location: payload.localizacao ?? null,
    });
    await stockRepository.addBatchQuantity(connection, productId, batch.id, quantity);

    if (quantity > 0) {
      await movementService.recordMovement(connection, {
        productId,
        batchId: batch.id,
        type: 'entrada',
        subtype: null,
        quantity,
        previousQuantity: 0,
        currentQuantity: quantity,
        reason: 'Cadastro inicial do produto',
      });
    }

    return getProductById(productId, connection);
  });
}

// Batches change only through stock entries; editing a product never touches them (RF-05).
async function updateProduct(productId, payload) {
  return database.withTransaction(async (connection) => {
    await lockExistingProduct(connection, productId);

    const categoryId = await categoryService.ensureCategory(connection, payload.categoria);
    await productRepository.updateProduct(connection, productId, { payload, categoryId });

    if (payload.quantidade_minima !== undefined || payload.localizacao !== undefined) {
      await stockRepository.updateStockDetails(connection, productId, {
        minimumQuantity: payload.quantidade_minima,
        location: payload.localizacao,
      });
    }

    return getProductById(productId, connection);
  });
}

async function setProductActive(productId, active) {
  return database.withTransaction(async (connection) => {
    await lockExistingProduct(connection, productId);
    await productRepository.updateProductStatus(connection, productId, active ? STATUS_IDS.ATIVO : STATUS_IDS.INATIVO);
    return getProductById(productId, connection);
  });
}

// A product with stock history is inactivated instead of deleted, so the history is kept (RF-10).
async function deleteProduct(productId) {
  return database.withTransaction(async (connection) => {
    await lockExistingProduct(connection, productId);

    const movementCount = await movementRepository.countMovements(connection, productId);
    if (movementCount > 0) {
      await productRepository.updateProductStatus(connection, productId, STATUS_IDS.INATIVO);
      return { deleted: false, deactivated: true };
    }

    await productRepository.deleteProduct(connection, productId);
    return { deleted: true, deactivated: false };
  });
}

module.exports = {
  listProducts,
  getProductById,
  lockExistingProduct,
  createProduct,
  updateProduct,
  setProductActive,
  deleteProduct,
};

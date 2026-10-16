const database = require('../database');
const productRepository = require('../repositories/productRepository');
const stockRepository = require('../repositories/stockRepository');
const categoryService = require('./categoryService');
const batchService = require('./batchService');
const movementService = require('./movementService');
const { calculateStatusId } = require('../productStatus');
const { NotFoundError } = require('../errors');

async function listProducts() {
  return productRepository.listProducts();
}

async function getProductById(productId, connection) {
  const product = await productRepository.findProductById(productId, connection);
  if (!product) {
    throw new NotFoundError('Produto não encontrado');
  }
  return product;
}

async function resolveProductReferences(connection, payload, quantity) {
  const categoryId = await categoryService.ensureCategory(connection, payload.categoria);
  const batchId = await batchService.ensureBatch(connection, {
    batchCode: payload.codigo_lote,
    expirationDate: payload.data_validade,
    entryDate: payload.data_entrada,
  });
  const statusId = calculateStatusId({ dataValidade: payload.data_validade, quantidade: quantity });
  return { payload, categoryId, batchId, statusId };
}

async function createProduct(payload) {
  return database.withTransaction(async (connection) => {
    const references = await resolveProductReferences(connection, payload, payload.quantidade_estoque);
    const productId = await productRepository.createProduct(connection, references);

    await stockRepository.createStock(connection, productId, {
      quantity: payload.quantidade_estoque,
      minimumQuantity: payload.quantidade_minima || 0,
      location: payload.localizacao || null,
    });

    if (payload.quantidade_estoque > 0) {
      await movementService.recordMovement(connection, {
        productId,
        type: 'entrada',
        subtype: null,
        quantity: payload.quantidade_estoque,
        previousQuantity: 0,
        currentQuantity: payload.quantidade_estoque,
        reason: 'Cadastro inicial do produto',
      });
    }

    return getProductById(productId, connection);
  });
}

async function updateProduct(productId, payload) {
  return database.withTransaction(async (connection) => {
    const product = await productRepository.lockProductForUpdate(connection, productId);
    if (!product) {
      throw new NotFoundError('Produto não encontrado');
    }

    const references = await resolveProductReferences(connection, payload, product.quantidade_estoque || 0);
    await productRepository.updateProduct(connection, productId, references);

    if (payload.quantidade_minima !== undefined || payload.localizacao !== undefined) {
      await stockRepository.updateStockDetails(connection, productId, {
        minimumQuantity: payload.quantidade_minima,
        location: payload.localizacao,
      });
    }

    return getProductById(productId, connection);
  });
}

async function deleteProduct(productId) {
  const deleted = await productRepository.deleteProduct(productId);
  if (!deleted) {
    throw new NotFoundError('Produto não encontrado');
  }
  return true;
}

module.exports = { listProducts, getProductById, createProduct, updateProduct, deleteProduct };

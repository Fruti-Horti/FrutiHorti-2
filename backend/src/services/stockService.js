const database = require('../database');
const productRepository = require('../repositories/productRepository');
const stockRepository = require('../repositories/stockRepository');
const movementService = require('./movementService');
const { NotFoundError } = require('../errors');
const { calculateStatusId } = require('../productStatus');
const { assertStockExitAllowed } = require('../stockRules');

// Expiration and low-stock fields are derived on every product read (see describeProduct).
async function getStockSummary() {
  return productRepository.listProducts();
}

async function getLockedStock(connection, productId) {
  const stock = await stockRepository.lockProductStock(connection, productId);
  if (!stock) {
    throw new NotFoundError('Produto não encontrado');
  }
  return stock;
}

async function applyStockMovement(connection, current, movement) {
  await stockRepository.updateQuantity(connection, movement.productId, movement.currentQuantity);
  const statusId = calculateStatusId({
    dataValidade: current.data_validade,
    quantidade: movement.currentQuantity,
  });
  await productRepository.updateProductStatus(connection, movement.productId, statusId);
  await movementService.recordMovement(connection, movement);
  const product = await productRepository.findProductById(movement.productId, connection);
  if (!product) {
    throw new NotFoundError('Produto não encontrado');
  }
  return product;
}

async function registerStockEntry(productId, { quantidade: quantity, motivo: reason }) {
  return database.withTransaction(async (connection) => {
    const current = await getLockedStock(connection, productId);
    const previousQuantity = current.quantidade || 0;

    return applyStockMovement(connection, current, {
      productId,
      type: 'entrada',
      subtype: null,
      quantity,
      previousQuantity,
      currentQuantity: previousQuantity + quantity,
      reason,
    });
  });
}

async function registerStockExit(productId, { quantidade: quantity, motivo: reason, subtipo: subtype }) {
  return database.withTransaction(async (connection) => {
    const current = await getLockedStock(connection, productId);
    const previousQuantity = current.quantidade || 0;

    assertStockExitAllowed({
      subtipo: subtype,
      dataValidade: current.data_validade,
      currentQuantity: previousQuantity,
      quantidade: quantity,
    });

    return applyStockMovement(connection, current, {
      productId,
      type: 'saida',
      subtype,
      quantity,
      previousQuantity,
      currentQuantity: previousQuantity - quantity,
      reason,
    });
  });
}

module.exports = { getStockSummary, registerStockEntry, registerStockExit };

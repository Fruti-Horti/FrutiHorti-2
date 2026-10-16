const database = require('../database');
const productRepository = require('../repositories/productRepository');
const stockRepository = require('../repositories/stockRepository');
const movementService = require('./movementService');
const { NotFoundError, BusinessRuleError, ValidationError } = require('../errors');
const { calculateStatusId, isExpired, daysUntilExpiration } = require('../productStatus');

const LOW_STOCK_OR_EXPIRING_SOON_DAYS = 3;

function buildAlert(product) {
  const days = daysUntilExpiration(product.data_validade);
  const isLowStock = product.quantidade_estoque <= product.quantidade_minima;
  const isExpiringSoon = days <= LOW_STOCK_OR_EXPIRING_SOON_DAYS;

  return { ...product, dias_para_vencer: days, estoque_baixo: isLowStock, proximo_do_vencimento: isExpiringSoon };
}

async function getStockSummary() {
  const products = await productRepository.listProducts();
  return products.map(buildAlert);
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

    if (subtype === 'venda' && isExpired(current.data_validade)) {
      throw new BusinessRuleError('Não é permitido registrar venda de produto vencido');
    }
    if (quantity > previousQuantity) {
      throw new ValidationError('Quantidade em estoque insuficiente para essa saída');
    }

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

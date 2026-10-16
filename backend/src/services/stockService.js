const database = require('../database');
const stockRepository = require('../repositories/stockRepository');
const productService = require('./productService');
const batchService = require('./batchService');
const movementService = require('./movementService');
const { NotFoundError, ValidationError } = require('../errors');
const { SALE_SUBTYPE, assertProductCanBeSold, assertStockEntryAllowed, planStockExit } = require('../stockRules');

function sumBatchQuantities(batches) {
  return batches.reduce((total, batch) => total + Number(batch.quantidade), 0);
}

// Expiration, batch and low-stock fields are derived on every product read (see describeProduct).
// The stock screen also lists inactive products, so they can be reactivated.
async function getStockSummary() {
  return productService.listProducts({ includeInactive: true });
}

async function resolveEntryBatch(connection, productId, { codigoLote, dataValidade, dataEntrada }) {
  if (codigoLote) {
    const batch = await batchService.ensureBatch(connection, {
      batchCode: codigoLote,
      expirationDate: dataValidade,
      entryDate: dataEntrada,
    });
    return { ...batch, lote_id: batch.id };
  }

  const latestBatch = await stockRepository.findLatestProductBatch(connection, productId);
  if (!latestBatch) {
    throw new ValidationError('Produto sem lote cadastrado; informe codigo_lote e data_validade');
  }
  return latestBatch;
}

async function registerStockEntry(productId, { quantidade: quantity, motivo: reason, codigoLote, dataValidade, dataEntrada }) {
  return database.withTransaction(async (connection) => {
    await productService.lockExistingProduct(connection, productId);
    const batch = await resolveEntryBatch(connection, productId, { codigoLote, dataValidade, dataEntrada });
    assertStockEntryAllowed(batch);

    const batches = await stockRepository.listProductBatchStock(connection, productId, { forUpdate: true });
    const previousQuantity = sumBatchQuantities(batches);
    const currentQuantity = previousQuantity + quantity;

    await stockRepository.addBatchQuantity(connection, productId, batch.lote_id, quantity);
    await stockRepository.updateQuantity(connection, productId, currentQuantity);
    await movementService.recordMovement(connection, {
      productId,
      batchId: batch.lote_id,
      type: 'entrada',
      subtype: null,
      quantity,
      previousQuantity,
      currentQuantity,
      reason,
    });

    return productService.getProductById(productId, connection);
  });
}

function selectExitBatches(batches, codigoLote) {
  if (!codigoLote) {
    return batches;
  }

  const selectedBatches = batches.filter((batch) => batch.codigo_lote === codigoLote);
  if (selectedBatches.length === 0) {
    throw new NotFoundError(`Lote ${codigoLote} não encontrado para este produto`);
  }
  return selectedBatches;
}

// Exits consume the earliest-expiring batches first (FEFO); a sale never consumes an expired batch.
// Each consumed batch gets its own movement, so the history shows exactly which batches left stock.
async function registerStockExit(productId, { quantidade: quantity, motivo: reason, subtipo: subtype, codigoLote }) {
  return database.withTransaction(async (connection) => {
    const product = await productService.lockExistingProduct(connection, productId);
    if (subtype === SALE_SUBTYPE) {
      assertProductCanBeSold(product.status);
    }

    const batches = await stockRepository.listProductBatchStock(connection, productId, { forUpdate: true });
    const allocations = planStockExit(selectExitBatches(batches, codigoLote), { quantidade: quantity, subtipo: subtype });

    let runningQuantity = sumBatchQuantities(batches);
    for (const allocation of allocations) {
      await stockRepository.subtractBatchQuantity(connection, productId, allocation.lote_id, allocation.quantidade);
      await movementService.recordMovement(connection, {
        productId,
        batchId: allocation.lote_id,
        type: 'saida',
        subtype,
        quantity: allocation.quantidade,
        previousQuantity: runningQuantity,
        currentQuantity: runningQuantity - allocation.quantidade,
        reason,
      });
      runningQuantity -= allocation.quantidade;
    }

    await stockRepository.updateQuantity(connection, productId, runningQuantity);
    return productService.getProductById(productId, connection);
  });
}

module.exports = { getStockSummary, registerStockEntry, registerStockExit };

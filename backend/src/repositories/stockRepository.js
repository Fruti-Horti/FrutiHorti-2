const { initDatabase, withTransaction } = require('../connection');
const { NotFoundError, ValidationError } = require('../errors');
const { SALE_SUBTYPE, assertProductCanBeSold, assertStockEntryAllowed, planStockExit } = require('../stockRules');
const {
  listProductLots,
  findLatestProductLot,
  findOrCreateLot,
  addLotQuantity,
  subtractLotQuantity,
  getProductStockTotal,
  syncStockTotal,
} = require('./lotRepository');
const { insertMovement, listProductMovements } = require('./movementRepository');
const { getProductById, lockProduct } = require('./productRepository');

async function resolveEntryLot(connection, productId, { codigoLote, dataValidade, dataEntrada }) {
  if (codigoLote) {
    return findOrCreateLot(connection, { codigoLote, dataValidade, dataEntrada });
  }

  const latestLot = await findLatestProductLot(connection, productId);
  if (!latestLot) {
    throw new ValidationError('Produto sem lote cadastrado; informe codigo_lote e data_validade');
  }
  return latestLot;
}

async function registerStockEntry(productId, { quantidade, motivo, codigoLote, dataValidade, dataEntrada }) {
  return withTransaction(async (connection) => {
    await lockProduct(connection, productId);
    const lot = await resolveEntryLot(connection, productId, { codigoLote, dataValidade, dataEntrada });
    assertStockEntryAllowed(lot);

    const previousQuantity = await getProductStockTotal(connection, productId);
    await addLotQuantity(connection, productId, lot.lote_id, quantidade);
    const newQuantity = await syncStockTotal(connection, productId);

    await insertMovement(connection, {
      produtoId: productId,
      loteId: lot.lote_id,
      tipo: 'entrada',
      subtipo: null,
      quantidade,
      quantidadeAnterior: previousQuantity,
      quantidadeAtual: newQuantity,
      motivo,
    });

    return getProductById(productId, connection);
  });
}

async function lockExitCandidateLots(connection, productId, codigoLote) {
  const lots = await listProductLots(connection, productId, { forUpdate: true });
  if (!codigoLote) {
    return lots;
  }

  const selectedLots = lots.filter((lot) => lot.codigo_lote === codigoLote);
  if (selectedLots.length === 0) {
    throw new NotFoundError(`Lote ${codigoLote} não encontrado para este produto`);
  }
  return selectedLots;
}

// Each consumed lot gets its own movement, so the history shows exactly which lots left stock.
async function registerStockExit(productId, { quantidade, motivo, subtipo, codigoLote }) {
  return withTransaction(async (connection) => {
    const product = await lockProduct(connection, productId);
    if (subtipo === SALE_SUBTYPE) {
      assertProductCanBeSold(product.status);
    }

    const candidateLots = await lockExitCandidateLots(connection, productId, codigoLote);
    const allocations = planStockExit(candidateLots, { quantidade, subtipo });

    let runningQuantity = await getProductStockTotal(connection, productId);
    for (const allocation of allocations) {
      await subtractLotQuantity(connection, productId, allocation.lote_id, allocation.quantidade);
      await insertMovement(connection, {
        produtoId: productId,
        loteId: allocation.lote_id,
        tipo: 'saida',
        subtipo,
        quantidade: allocation.quantidade,
        quantidadeAnterior: runningQuantity,
        quantidadeAtual: runningQuantity - allocation.quantidade,
        motivo,
      });
      runningQuantity -= allocation.quantidade;
    }

    await syncStockTotal(connection, productId);
    return getProductById(productId, connection);
  });
}

async function listMovements(productId) {
  const database = await initDatabase();
  await getProductById(productId, database);
  return listProductMovements(database, productId);
}

module.exports = { registerStockEntry, registerStockExit, listMovements };

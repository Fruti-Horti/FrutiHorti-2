const batchRepository = require('../repositories/batchRepository');
const { ConflictError } = require('../errors');
const { getStoreToday, toDateString } = require('../productStatus');

// A batch may be shared by several products, so saving one product must never change the batch's dates.
function assertSameBatchDates(batchCode, existingBatch, { expirationDate, entryDate }) {
  const storedExpirationDate = toDateString(existingBatch.data_validade);
  if (storedExpirationDate !== expirationDate) {
    throw new ConflictError(
      `O lote ${batchCode} já existe com validade ${storedExpirationDate}. Use outro código de lote ou a mesma validade.`
    );
  }

  const storedEntryDate = toDateString(existingBatch.data_entrada);
  if (entryDate && storedEntryDate !== entryDate) {
    throw new ConflictError(
      `O lote ${batchCode} já existe com data de entrada ${storedEntryDate}. Use outro código de lote ou a mesma data.`
    );
  }
}

async function ensureBatch(connection, { batchCode, expirationDate, entryDate }) {
  const normalizedCode = String(batchCode).trim();
  const batch = await batchRepository.findBatchByCode(connection, normalizedCode);

  if (batch) {
    assertSameBatchDates(normalizedCode, batch, { expirationDate, entryDate });
    return batch.id;
  }

  return batchRepository.createBatch(connection, {
    batchCode: normalizedCode,
    entryDate: entryDate || getStoreToday(),
    expirationDate,
  });
}

module.exports = { ensureBatch };

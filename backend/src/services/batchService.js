const batchRepository = require('../repositories/batchRepository');

async function ensureBatch(connection, { batchCode, expirationDate, entryDate }) {
  const normalizedCode = String(batchCode).trim();
  const resolvedEntryDate = entryDate || new Date().toISOString().slice(0, 10);
  const batch = await batchRepository.findBatchByCode(connection, normalizedCode);

  if (batch) {
    await batchRepository.updateExpirationDate(connection, batch.id, expirationDate);
    return batch.id;
  }

  return batchRepository.createBatch(connection, {
    batchCode: normalizedCode,
    entryDate: resolvedEntryDate,
    expirationDate,
  });
}

module.exports = { ensureBatch };

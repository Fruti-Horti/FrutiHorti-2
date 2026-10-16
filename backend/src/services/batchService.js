const batchRepository = require('../repositories/batchRepository');
const { ConflictError, ValidationError } = require('../errors');
const { getStoreToday, toDateString } = require('../productStatus');

// A batch is a shipment that may hold several products, so its dates are never changed by saving
// a product or registering an entry. Dates sent for an existing batch must match the stored ones.
function assertSameBatchDates(batchCode, existingBatch, { expirationDate, entryDate }) {
  const storedExpirationDate = toDateString(existingBatch.data_validade);
  if (expirationDate && storedExpirationDate !== expirationDate) {
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

// Returns the batch ({ id, codigo_lote, data_entrada, data_validade }), creating it when the code is new.
// A new batch needs an expiration date; an existing one may be referenced by code alone.
async function ensureBatch(connection, { batchCode, expirationDate, entryDate }) {
  const normalizedCode = String(batchCode).trim();
  const batch = await batchRepository.findBatchByCode(connection, normalizedCode);

  if (batch) {
    assertSameBatchDates(normalizedCode, batch, { expirationDate, entryDate });
    return batch;
  }

  if (!expirationDate) {
    throw new ValidationError(`O lote ${normalizedCode} não existe; informe data_validade para criá-lo`);
  }

  const newBatch = {
    codigo_lote: normalizedCode,
    data_entrada: entryDate || getStoreToday(),
    data_validade: expirationDate,
  };
  const id = await batchRepository.createBatch(connection, {
    batchCode: newBatch.codigo_lote,
    entryDate: newBatch.data_entrada,
    expirationDate: newBatch.data_validade,
  });
  return { id, ...newBatch };
}

module.exports = { ensureBatch };

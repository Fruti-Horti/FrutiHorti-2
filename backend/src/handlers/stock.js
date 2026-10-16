const database = require('../database');
const { sendJson, parseJsonBody } = require('../httpUtils');
const { validateStockMovementPayload, normalizeStockMovementPayload } = require('../validators');
const { ValidationError } = require('../errors');

// Expiration, lot and low-stock fields are derived on every product read (see describeProduct).
// The stock screen also lists inactive products, so they can be reactivated.
async function getStockSummary(req, res) {
  const items = await database.listProducts({ includeInactive: true });
  sendJson(res, 200, { items });
}

async function listMovements(req, res, [productId]) {
  const items = await database.listMovements(Number(productId));
  sendJson(res, 200, { items });
}

async function readStockMovement(req, options) {
  const body = await parseJsonBody(req);
  const validationError = validateStockMovementPayload(body, options);
  if (validationError) {
    throw new ValidationError(validationError);
  }
  return normalizeStockMovementPayload(body);
}

async function registerStockEntry(req, res, [productId]) {
  const { quantidade, motivo, codigoLote, dataValidade, dataEntrada } = await readStockMovement(req);
  const item = await database.registerStockEntry(Number(productId), {
    quantidade,
    motivo,
    codigoLote,
    dataValidade,
    dataEntrada,
  });

  sendJson(res, 200, { item });
}

async function registerStockExit(req, res, [productId]) {
  const { quantidade, subtipo, motivo, codigoLote } = await readStockMovement(req, { requireSubtipo: true });
  const item = await database.registerStockExit(Number(productId), { quantidade, subtipo, motivo, codigoLote });

  sendJson(res, 200, { item });
}

module.exports = { getStockSummary, listMovements, registerStockEntry, registerStockExit };

const database = require('../database');
const { sendJson, parseJsonBody } = require('../httpUtils');
const { validateStockMovementPayload } = require('../validators');
const { ValidationError } = require('../errors');

// Expiration and low-stock fields are derived on every product read (see describeProduct).
async function getStockSummary(req, res) {
  const items = await database.listProducts();
  sendJson(res, 200, { items });
}

async function listMovements(req, res, [productId]) {
  const items = await database.listMovements(Number(productId));
  sendJson(res, 200, { items });
}

async function registerStockEntry(req, res, [productId]) {
  const body = await parseJsonBody(req);
  const validationError = validateStockMovementPayload(body);
  if (validationError) {
    throw new ValidationError(validationError);
  }

  const item = await database.registerStockEntry(Number(productId), {
    quantidade: Number(body.quantidade),
    motivo: body.motivo ? String(body.motivo).trim() : null,
  });

  sendJson(res, 200, { item });
}

async function registerStockExit(req, res, [productId]) {
  const body = await parseJsonBody(req);
  const validationError = validateStockMovementPayload(body, { requireSubtipo: true });
  if (validationError) {
    throw new ValidationError(validationError);
  }

  const item = await database.registerStockExit(Number(productId), {
    quantidade: Number(body.quantidade),
    subtipo: body.subtipo,
    motivo: body.motivo ? String(body.motivo).trim() : null,
  });

  sendJson(res, 200, { item });
}

module.exports = { getStockSummary, listMovements, registerStockEntry, registerStockExit };

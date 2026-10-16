const stockService = require('../services/stockService');
const { sendJson, parseJsonBody } = require('../httpUtils');
const { validateStockMovementPayload } = require('../validators');
const { ValidationError } = require('../errors');

async function getStockSummary(req, res) {
  const items = await stockService.getStockSummary();
  sendJson(res, 200, { items });
}

async function registerStockEntry(req, res, [productId]) {
  const body = await parseJsonBody(req);
  const validationError = validateStockMovementPayload(body);
  if (validationError) {
    throw new ValidationError(validationError);
  }

  const item = await stockService.registerStockEntry(Number(productId), {
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

  const item = await stockService.registerStockExit(Number(productId), {
    quantidade: Number(body.quantidade),
    subtipo: body.subtipo,
    motivo: body.motivo ? String(body.motivo).trim() : null,
  });

  sendJson(res, 200, { item });
}

module.exports = { getStockSummary, registerStockEntry, registerStockExit };

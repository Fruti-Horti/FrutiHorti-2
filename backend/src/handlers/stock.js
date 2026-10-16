const stockService = require('../services/stockService');
const { sendJson, parseJsonBody } = require('../httpUtils');
const { validateStockMovementPayload, normalizeStockMovementPayload } = require('../validators');
const { ValidationError } = require('../errors');

async function getStockSummary(req, res) {
  const items = await stockService.getStockSummary();
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

// codigo_lote is optional: entries without it go to the product's latest batch.
async function registerStockEntry(req, res, [productId]) {
  const { quantidade, motivo, codigoLote, dataValidade, dataEntrada } = await readStockMovement(req);
  const item = await stockService.registerStockEntry(Number(productId), {
    quantidade,
    motivo,
    codigoLote,
    dataValidade,
    dataEntrada,
  });

  sendJson(res, 200, { item });
}

// codigo_lote is optional: exits without it consume batches in FEFO order.
async function registerStockExit(req, res, [productId]) {
  const { quantidade, subtipo, motivo, codigoLote } = await readStockMovement(req, { requireSubtipo: true });
  const item = await stockService.registerStockExit(Number(productId), { quantidade, subtipo, motivo, codigoLote });

  sendJson(res, 200, { item });
}

module.exports = { getStockSummary, registerStockEntry, registerStockExit };

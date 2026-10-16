const movementService = require('../services/movementService');
const { sendJson } = require('../httpUtils');

async function listMovements(req, res, [productId]) {
  const items = await movementService.listMovements(Number(productId));
  sendJson(res, 200, { items });
}

module.exports = { listMovements };

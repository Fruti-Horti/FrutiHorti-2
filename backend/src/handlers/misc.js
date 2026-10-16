const categoryService = require('../services/categoryService');
const { sendJson } = require('../httpUtils');

async function health(req, res) {
  sendJson(res, 200, { status: 'ok', service: 'frutihorti-backend' });
}

async function listCategories(req, res) {
  const items = await categoryService.listCategories();
  sendJson(res, 200, { items });
}

module.exports = { health, listCategories };

const productService = require('../services/productService');
const { sendJson, parseJsonBody } = require('../httpUtils');
const { validateProductPayload, normalizeProductPayload } = require('../validators');
const { ValidationError } = require('../errors');

async function listProducts(req, res) {
  const items = await productService.listProducts();
  sendJson(res, 200, { items });
}

async function getProduct(req, res, [productId]) {
  const item = await productService.getProductById(Number(productId));
  sendJson(res, 200, { item });
}

async function createProduct(req, res) {
  const body = await parseJsonBody(req);
  const validationError = validateProductPayload(body, { isUpdate: false });
  if (validationError) {
    throw new ValidationError(validationError);
  }

  const item = await productService.createProduct(normalizeProductPayload(body, { isUpdate: false }));
  sendJson(res, 201, { item });
}

async function updateProduct(req, res, [productId]) {
  const body = await parseJsonBody(req);
  const validationError = validateProductPayload(body, { isUpdate: true });
  if (validationError) {
    throw new ValidationError(validationError);
  }

  const item = await productService.updateProduct(Number(productId), normalizeProductPayload(body, { isUpdate: true }));
  sendJson(res, 200, { item });
}

async function deleteProduct(req, res, [productId]) {
  await productService.deleteProduct(Number(productId));
  sendJson(res, 200, { deleted: true });
}

module.exports = { listProducts, getProduct, createProduct, updateProduct, deleteProduct };

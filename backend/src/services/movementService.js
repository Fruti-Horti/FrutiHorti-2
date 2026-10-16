const database = require('../database');
const movementRepository = require('../repositories/movementRepository');
const productRepository = require('../repositories/productRepository');
const { NotFoundError } = require('../errors');

async function recordMovement(connection, movement) {
  await movementRepository.insertMovement(connection, movement);
}

async function listMovements(productId) {
  const connection = await database.initDatabase();
  const product = await productRepository.findProductById(productId, connection);
  if (!product) {
    throw new NotFoundError('Produto não encontrado');
  }

  return movementRepository.listMovements(productId, connection);
}

module.exports = { recordMovement, listMovements };

// Single entry point for data access used by the handlers.
const { getDbConfig, initDatabase } = require('./connection');
const productRepository = require('./repositories/productRepository');
const stockRepository = require('./repositories/stockRepository');

module.exports = {
  getDbConfig,
  initDatabase,
  listProducts: productRepository.listProducts,
  getProductById: productRepository.getProductById,
  listCategories: productRepository.listCategories,
  createProduct: productRepository.createProduct,
  updateProduct: productRepository.updateProduct,
  setProductActive: productRepository.setProductActive,
  deleteProduct: productRepository.deleteProduct,
  registerStockEntry: stockRepository.registerStockEntry,
  registerStockExit: stockRepository.registerStockExit,
  listMovements: stockRepository.listMovements,
};

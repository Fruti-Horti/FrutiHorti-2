const productHandlers = require('./handlers/products');
const stockHandlers = require('./handlers/stock');
const miscHandlers = require('./handlers/misc');

const routes = [
  { method: 'GET', pattern: /^\/health$/, handler: miscHandlers.health },
  { method: 'GET', pattern: /^\/categories$/, handler: miscHandlers.listCategories },

  { method: 'GET', pattern: /^\/products$/, handler: productHandlers.listProducts },
  { method: 'POST', pattern: /^\/products$/, handler: productHandlers.createProduct },
  { method: 'GET', pattern: /^\/products\/(\d+)$/, handler: productHandlers.getProduct },
  { method: 'PUT', pattern: /^\/products\/(\d+)$/, handler: productHandlers.updateProduct },
  { method: 'DELETE', pattern: /^\/products\/(\d+)$/, handler: productHandlers.deleteProduct },

  { method: 'GET', pattern: /^\/stock$/, handler: stockHandlers.getStockSummary },
  { method: 'GET', pattern: /^\/products\/(\d+)\/movements$/, handler: stockHandlers.listMovements },
  { method: 'POST', pattern: /^\/products\/(\d+)\/stock\/entries$/, handler: stockHandlers.registerStockEntry },
  { method: 'POST', pattern: /^\/products\/(\d+)\/stock\/exits$/, handler: stockHandlers.registerStockExit },
];

function findRoute(method, pathname) {
  for (const route of routes) {
    if (route.method !== method) continue;

    const match = route.pattern.exec(pathname);
    if (match) {
      return { handler: route.handler, params: match.slice(1) };
    }
  }

  return null;
}

module.exports = { findRoute };

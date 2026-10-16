const database = require('../database');
const { STATUS_IDS } = require('../productStatus');

// Batch, stock and expiration fields are not stored per product; productService derives them
// from the product's batches (see describeProduct).
const PRODUCT_SELECT = `
  SELECT
    p.id,
    p.nome,
    c.nome AS categoria,
    p.preco_unitario,
    p.perecivel,
    s.nome AS status,
    e.quantidade_minima,
    e.localizacao
  FROM produtos p
  INNER JOIN categorias c ON c.id = p.categoria_id
  INNER JOIN status s ON s.id = p.status_id
  LEFT JOIN estoque e ON e.produto_id = p.id
`;

async function listProducts(executor, { includeInactive = false } = {}) {
  const filter = includeInactive ? '' : 'WHERE p.status_id <> ?';
  const params = includeInactive ? [] : [STATUS_IDS.INATIVO];
  const [rows] = await executor.execute(`${PRODUCT_SELECT} ${filter} ORDER BY p.id ASC`, params);
  return rows;
}

async function findProductById(productId, connection) {
  const executor = connection || (await database.initDatabase());
  const [rows] = await executor.execute(`${PRODUCT_SELECT} WHERE p.id = ?`, [productId]);
  return rows[0] || null;
}

async function lockProductForUpdate(connection, productId) {
  const [rows] = await connection.execute(
    `SELECT p.id, s.nome AS status
     FROM produtos p
     INNER JOIN status s ON s.id = p.status_id
     WHERE p.id = ?
     LIMIT 1
     FOR UPDATE`,
    [productId]
  );
  return rows[0] || null;
}

async function createProduct(connection, { payload, categoryId, statusId }) {
  const [result] = await connection.execute(
    `INSERT INTO produtos (nome, categoria_id, status_id, preco_unitario, perecivel)
     VALUES (?, ?, ?, ?, ?)`,
    [payload.nome, categoryId, statusId, payload.preco_unitario, payload.perecivel ? 1 : 0]
  );
  return result.insertId;
}

async function updateProduct(connection, productId, { payload, categoryId }) {
  await connection.execute(
    `UPDATE produtos
     SET nome = ?, categoria_id = ?, preco_unitario = ?, perecivel = ?
     WHERE id = ?`,
    [payload.nome, categoryId, payload.preco_unitario, payload.perecivel ? 1 : 0, productId]
  );
}

async function updateProductStatus(connection, productId, statusId) {
  await connection.execute('UPDATE produtos SET status_id = ? WHERE id = ?', [statusId, productId]);
}

async function deleteProduct(connection, productId) {
  const [result] = await connection.execute('DELETE FROM produtos WHERE id = ?', [productId]);
  return result.affectedRows > 0;
}

module.exports = {
  listProducts,
  findProductById,
  lockProductForUpdate,
  createProduct,
  updateProduct,
  updateProductStatus,
  deleteProduct,
};

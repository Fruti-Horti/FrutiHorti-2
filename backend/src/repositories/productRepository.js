const database = require('../database');
const { describeProduct } = require('../productStatus');

const PRODUCT_SELECT = `
  SELECT
    p.id,
    p.nome,
    c.nome AS categoria,
    l.codigo_lote,
    l.data_entrada,
    l.data_validade,
    p.preco_unitario,
    p.perecivel,
    s.nome AS status,
    e.quantidade AS quantidade_estoque,
    e.quantidade_minima,
    e.localizacao
  FROM produtos p
  INNER JOIN categorias c ON c.id = p.categoria_id
  INNER JOIN lotes l ON l.id = p.lote_id
  INNER JOIN status s ON s.id = p.status_id
  LEFT JOIN estoque e ON e.produto_id = p.id
`;

async function listProducts() {
  const executor = await database.initDatabase();
  const [rows] = await executor.execute(`${PRODUCT_SELECT} ORDER BY p.id ASC`);
  return rows.map((row) => describeProduct(row));
}

async function findProductById(productId, connection) {
  const executor = connection || (await database.initDatabase());
  const [rows] = await executor.execute(`${PRODUCT_SELECT} WHERE p.id = ?`, [productId]);
  return rows[0] ? describeProduct(rows[0]) : null;
}

async function lockProductForUpdate(connection, productId) {
  const [rows] = await connection.execute(
    'SELECT p.id, e.quantidade AS quantidade_estoque FROM produtos p LEFT JOIN estoque e ON e.produto_id = p.id WHERE p.id = ? LIMIT 1 FOR UPDATE',
    [productId]
  );
  return rows[0] || null;
}

async function createProduct(connection, { payload, categoryId, batchId, statusId }) {
  const [result] = await connection.execute(
    `INSERT INTO produtos (nome, categoria_id, lote_id, status_id, preco_unitario, perecivel)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [payload.nome, categoryId, batchId, statusId, payload.preco_unitario, payload.perecivel ? 1 : 0]
  );
  return result.insertId;
}

async function updateProduct(connection, productId, { payload, categoryId, batchId, statusId }) {
  await connection.execute(
    `UPDATE produtos
     SET nome = ?, categoria_id = ?, lote_id = ?, status_id = ?, preco_unitario = ?, perecivel = ?
     WHERE id = ?`,
    [payload.nome, categoryId, batchId, statusId, payload.preco_unitario, payload.perecivel ? 1 : 0, productId]
  );
}

async function updateProductStatus(connection, productId, statusId) {
  await connection.execute('UPDATE produtos SET status_id = ? WHERE id = ?', [statusId, productId]);
}

async function deleteProduct(productId) {
  const executor = await database.initDatabase();
  const [result] = await executor.execute('DELETE FROM produtos WHERE id = ?', [productId]);
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

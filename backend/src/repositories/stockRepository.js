// Product-level stock (estoque) and per-batch balances (estoque_lote).
// estoque.quantidade is kept equal to the sum of the product's batch balances.

const BATCH_STOCK_SELECT = `
  SELECT el.produto_id, l.id AS lote_id, l.codigo_lote, l.data_entrada, l.data_validade, el.quantidade
  FROM estoque_lote el
  INNER JOIN lotes l ON l.id = el.lote_id
`;

async function createStock(connection, productId, { quantity, minimumQuantity, location }) {
  await connection.execute(
    `INSERT INTO estoque (produto_id, quantidade, quantidade_minima, localizacao)
     VALUES (?, ?, ?, ?)`,
    [productId, quantity, minimumQuantity, location]
  );
}

// Only fields that are present are written; omitted fields keep their stored values,
// and an explicit null location clears it.
async function updateStockDetails(connection, productId, { minimumQuantity, location }) {
  const assignments = [];
  const values = [];

  if (minimumQuantity !== undefined) {
    assignments.push('quantidade_minima = ?');
    values.push(minimumQuantity);
  }

  if (location !== undefined) {
    assignments.push('localizacao = ?');
    values.push(location);
  }

  if (assignments.length === 0) {
    return;
  }

  await connection.execute(`UPDATE estoque SET ${assignments.join(', ')} WHERE produto_id = ?`, [...values, productId]);
}

async function updateQuantity(connection, productId, quantity) {
  await connection.execute('UPDATE estoque SET quantidade = ? WHERE produto_id = ?', [quantity, productId]);
}

async function listBatchStock(executor) {
  const [rows] = await executor.execute(
    `${BATCH_STOCK_SELECT} ORDER BY el.produto_id ASC, l.data_validade ASC, l.id ASC`
  );
  return rows;
}

async function listProductBatchStock(executor, productId, { forUpdate = false } = {}) {
  const lock = forUpdate ? 'FOR UPDATE' : '';
  const [rows] = await executor.execute(
    `${BATCH_STOCK_SELECT} WHERE el.produto_id = ? ORDER BY l.data_validade ASC, l.id ASC ${lock}`,
    [productId]
  );
  return rows;
}

// The batch that receives an entry when no batch code is given: the one with the latest expiration.
async function findLatestProductBatch(connection, productId) {
  const [rows] = await connection.execute(
    `${BATCH_STOCK_SELECT} WHERE el.produto_id = ? ORDER BY l.data_validade DESC, l.id DESC LIMIT 1`,
    [productId]
  );
  return rows[0] || null;
}

async function addBatchQuantity(connection, productId, batchId, quantity) {
  await connection.execute(
    `INSERT INTO estoque_lote (produto_id, lote_id, quantidade) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE quantidade = quantidade + ?`,
    [productId, batchId, quantity, quantity]
  );
}

async function subtractBatchQuantity(connection, productId, batchId, quantity) {
  await connection.execute(
    'UPDATE estoque_lote SET quantidade = quantidade - ? WHERE produto_id = ? AND lote_id = ?',
    [quantity, productId, batchId]
  );
}

module.exports = {
  createStock,
  updateStockDetails,
  updateQuantity,
  listBatchStock,
  listProductBatchStock,
  findLatestProductBatch,
  addBatchQuantity,
  subtractBatchQuantity,
};

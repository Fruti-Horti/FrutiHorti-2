async function createStock(connection, productId, { quantity, minimumQuantity, location }) {
  await connection.execute(
    `INSERT INTO estoque (produto_id, quantidade, quantidade_minima, localizacao)
     VALUES (?, ?, ?, ?)`,
    [productId, quantity, minimumQuantity, location]
  );
}

async function updateStockDetails(connection, productId, { minimumQuantity, location }) {
  await connection.execute(
    'UPDATE estoque SET quantidade_minima = COALESCE(?, quantidade_minima), localizacao = COALESCE(?, localizacao) WHERE produto_id = ?',
    [minimumQuantity, location, productId]
  );
}

async function lockProductStock(connection, productId) {
  const [rows] = await connection.execute(
    `SELECT p.id, p.status_id, l.data_validade, e.quantidade
     FROM produtos p
     INNER JOIN lotes l ON l.id = p.lote_id
     LEFT JOIN estoque e ON e.produto_id = p.id
     WHERE p.id = ?
     LIMIT 1
     FOR UPDATE`,
    [productId]
  );
  return rows[0] || null;
}

async function updateQuantity(connection, productId, quantity) {
  await connection.execute('UPDATE estoque SET quantidade = ? WHERE produto_id = ?', [quantity, productId]);
}

module.exports = { createStock, updateStockDetails, lockProductStock, updateQuantity };

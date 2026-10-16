const database = require('../database');

async function insertMovement(connection, movement) {
  await connection.execute(
    `INSERT INTO movimentacoes_estoque
      (produto_id, lote_id, tipo, subtipo, quantidade, quantidade_anterior, quantidade_atual, motivo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      movement.productId,
      movement.batchId ?? null,
      movement.type,
      movement.subtype,
      movement.quantity,
      movement.previousQuantity,
      movement.currentQuantity,
      movement.reason || null,
    ]
  );
}

async function listMovements(productId, connection) {
  const executor = connection || (await database.initDatabase());
  const [rows] = await executor.execute(
    `SELECT m.id, m.tipo, m.subtipo, m.quantidade, m.quantidade_anterior, m.quantidade_atual, m.motivo,
            m.data_movimentacao, l.codigo_lote
     FROM movimentacoes_estoque m
     LEFT JOIN lotes l ON l.id = m.lote_id
     WHERE m.produto_id = ?
     ORDER BY m.data_movimentacao DESC, m.id DESC`,
    [productId]
  );
  return rows;
}

async function countMovements(connection, productId) {
  const [rows] = await connection.execute(
    'SELECT COUNT(*) AS total FROM movimentacoes_estoque WHERE produto_id = ?',
    [productId]
  );
  return Number(rows[0].total);
}

module.exports = { insertMovement, listMovements, countMovements };

const database = require('../database');

async function insertMovement(connection, movement) {
  await connection.execute(
    `INSERT INTO movimentacoes_estoque
      (produto_id, tipo, subtipo, quantidade, quantidade_anterior, quantidade_atual, motivo)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      movement.productId,
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
    `SELECT id, tipo, subtipo, quantidade, quantidade_anterior, quantidade_atual, motivo, data_movimentacao
     FROM movimentacoes_estoque
     WHERE produto_id = ?
     ORDER BY data_movimentacao DESC, id DESC`,
    [productId]
  );
  return rows;
}

module.exports = { insertMovement, listMovements };

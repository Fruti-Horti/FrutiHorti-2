async function insertMovement(connection, movement) {
  await connection.execute(
    `INSERT INTO movimentacoes_estoque
      (produto_id, lote_id, tipo, subtipo, quantidade, quantidade_anterior, quantidade_atual, motivo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      movement.produtoId,
      movement.loteId ?? null,
      movement.tipo,
      movement.subtipo,
      movement.quantidade,
      movement.quantidadeAnterior,
      movement.quantidadeAtual,
      movement.motivo || null,
    ]
  );
}

async function countProductMovements(connection, productId) {
  const [rows] = await connection.execute(
    'SELECT COUNT(*) AS total FROM movimentacoes_estoque WHERE produto_id = ?',
    [productId]
  );
  return Number(rows[0].total);
}

async function listProductMovements(executor, productId) {
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

module.exports = { insertMovement, countProductMovements, listProductMovements };

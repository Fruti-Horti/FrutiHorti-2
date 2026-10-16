async function findBatchByCode(connection, batchCode) {
  const [rows] = await connection.execute(
    'SELECT id, codigo_lote, data_entrada, data_validade FROM lotes WHERE codigo_lote = ? LIMIT 1',
    [batchCode]
  );
  return rows[0] || null;
}

async function createBatch(connection, { batchCode, entryDate, expirationDate }) {
  const [result] = await connection.execute(
    'INSERT INTO lotes (codigo_lote, data_entrada, data_validade) VALUES (?, ?, ?)',
    [batchCode, entryDate, expirationDate]
  );
  return result.insertId;
}

module.exports = { findBatchByCode, createBatch };

const { ConflictError, ValidationError } = require('../errors');
const { getStoreToday, toDateString } = require('../productStatus');

const LOT_SELECT = `
  SELECT el.produto_id, l.id AS lote_id, l.codigo_lote, l.data_entrada, l.data_validade, el.quantidade
  FROM estoque_lote el
  INNER JOIN lotes l ON l.id = el.lote_id
`;

async function listLotsGroupedByProduct(executor) {
  const [rows] = await executor.execute(`${LOT_SELECT} ORDER BY el.produto_id ASC, l.data_validade ASC, l.id ASC`);

  const lotsByProduct = new Map();
  for (const row of rows) {
    const productLots = lotsByProduct.get(row.produto_id) || [];
    productLots.push(row);
    lotsByProduct.set(row.produto_id, productLots);
  }
  return lotsByProduct;
}

async function listProductLots(executor, productId, { forUpdate = false } = {}) {
  const lock = forUpdate ? 'FOR UPDATE' : '';
  const [rows] = await executor.execute(
    `${LOT_SELECT} WHERE el.produto_id = ? ORDER BY l.data_validade ASC, l.id ASC ${lock}`,
    [productId]
  );
  return rows;
}

// The lot that receives an entry when no lot code is given: the one with the latest expiration.
async function findLatestProductLot(connection, productId) {
  const [rows] = await connection.execute(
    `${LOT_SELECT} WHERE el.produto_id = ? ORDER BY l.data_validade DESC, l.id DESC LIMIT 1`,
    [productId]
  );
  return rows[0] || null;
}

// A lot is a shipment shared by several products, so its dates are never changed by saving a product
// or registering an entry. Dates sent for an existing lot must match the stored ones.
function assertSameLotDates(existingLot, { dataValidade, dataEntrada }) {
  const storedValidade = toDateString(existingLot.data_validade);
  if (dataValidade && storedValidade !== dataValidade) {
    throw new ConflictError(
      `O lote ${existingLot.codigo_lote} já existe com validade ${storedValidade}. Use outro código de lote ou a mesma validade.`
    );
  }

  const storedEntrada = toDateString(existingLot.data_entrada);
  if (dataEntrada && storedEntrada !== dataEntrada) {
    throw new ConflictError(
      `O lote ${existingLot.codigo_lote} já existe com data de entrada ${storedEntrada}. Use outro código de lote ou a mesma data.`
    );
  }
}

async function findOrCreateLot(connection, { codigoLote, dataValidade, dataEntrada }) {
  const normalizedCode = String(codigoLote).trim();

  const [rows] = await connection.execute(
    'SELECT id AS lote_id, codigo_lote, data_entrada, data_validade FROM lotes WHERE codigo_lote = ? LIMIT 1',
    [normalizedCode]
  );
  if (rows.length > 0) {
    assertSameLotDates(rows[0], { dataValidade, dataEntrada });
    return rows[0];
  }

  if (!dataValidade) {
    throw new ValidationError(`O lote ${normalizedCode} não existe; informe data_validade para criá-lo`);
  }

  const entrada = dataEntrada || getStoreToday();
  const [result] = await connection.execute(
    'INSERT INTO lotes (codigo_lote, data_entrada, data_validade) VALUES (?, ?, ?)',
    [normalizedCode, entrada, dataValidade]
  );
  return { lote_id: result.insertId, codigo_lote: normalizedCode, data_entrada: entrada, data_validade: dataValidade };
}

async function addLotQuantity(connection, productId, loteId, quantidade) {
  await connection.execute(
    `INSERT INTO estoque_lote (produto_id, lote_id, quantidade) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE quantidade = quantidade + ?`,
    [productId, loteId, quantidade, quantidade]
  );
}

async function subtractLotQuantity(connection, productId, loteId, quantidade) {
  await connection.execute(
    'UPDATE estoque_lote SET quantidade = quantidade - ? WHERE produto_id = ? AND lote_id = ?',
    [quantidade, productId, loteId]
  );
}

async function getProductStockTotal(connection, productId) {
  const [rows] = await connection.execute(
    'SELECT COALESCE(SUM(quantidade), 0) AS total FROM estoque_lote WHERE produto_id = ?',
    [productId]
  );
  return Number(rows[0].total);
}

// estoque.quantidade is kept equal to the sum of the product's lots.
async function syncStockTotal(connection, productId) {
  const total = await getProductStockTotal(connection, productId);
  await connection.execute('UPDATE estoque SET quantidade = ? WHERE produto_id = ?', [total, productId]);
  return total;
}

module.exports = {
  listLotsGroupedByProduct,
  listProductLots,
  findLatestProductLot,
  findOrCreateLot,
  addLotQuantity,
  subtractLotQuantity,
  getProductStockTotal,
  syncStockTotal,
};

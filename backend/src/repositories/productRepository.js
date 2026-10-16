const { initDatabase, withTransaction } = require('../connection');
const { NotFoundError } = require('../errors');
const { STATUS_IDS, describeProduct } = require('../productStatus');
const { assertStockEntryAllowed } = require('../stockRules');
const { listLotsGroupedByProduct, listProductLots, findOrCreateLot, addLotQuantity } = require('./lotRepository');
const { insertMovement, countProductMovements } = require('./movementRepository');

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

// The public catalog hides inactive products; the stock screen lists them so they can be reactivated.
async function listProducts({ includeInactive = false } = {}) {
  const database = await initDatabase();
  const filter = includeInactive ? '' : 'WHERE p.status_id <> ?';
  const params = includeInactive ? [] : [STATUS_IDS.INATIVO];

  const [rows] = await database.execute(`${PRODUCT_SELECT} ${filter} ORDER BY p.id ASC`, params);
  const lotsByProduct = await listLotsGroupedByProduct(database);
  return rows.map((row) => describeProduct(row, lotsByProduct.get(row.id) || []));
}

async function getProductById(productId, executor) {
  const database = executor || (await initDatabase());
  const [rows] = await database.execute(`${PRODUCT_SELECT} WHERE p.id = ?`, [productId]);

  if (rows.length === 0) {
    throw new NotFoundError('Produto não encontrado');
  }

  const lots = await listProductLots(database, productId);
  return describeProduct(rows[0], lots);
}

async function lockProduct(connection, productId) {
  const [rows] = await connection.execute(
    `SELECT p.id, s.nome AS status
     FROM produtos p
     INNER JOIN status s ON s.id = p.status_id
     WHERE p.id = ?
     LIMIT 1
     FOR UPDATE`,
    [productId]
  );

  if (rows.length === 0) {
    throw new NotFoundError('Produto não encontrado');
  }

  return rows[0];
}

async function listCategories() {
  const database = await initDatabase();
  const [rows] = await database.execute('SELECT id, nome, descricao FROM categorias ORDER BY nome ASC');
  return rows;
}

async function ensureCategory(connection, categoryName) {
  const normalized = String(categoryName).trim();

  const [rows] = await connection.execute('SELECT id FROM categorias WHERE nome = ? LIMIT 1', [normalized]);
  if (rows.length > 0) {
    return rows[0].id;
  }

  const [result] = await connection.execute(
    'INSERT INTO categorias (nome, descricao) VALUES (?, ?)',
    [normalized, `Categoria ${normalized}`]
  );
  return result.insertId;
}

async function createProduct(payload) {
  return withTransaction(async (connection) => {
    const categoryId = await ensureCategory(connection, payload.categoria);
    const lot = await findOrCreateLot(connection, {
      codigoLote: payload.codigo_lote,
      dataValidade: payload.data_validade,
      dataEntrada: payload.data_entrada,
    });

    if (payload.quantidade_estoque > 0) {
      assertStockEntryAllowed(lot);
    }

    const [productResult] = await connection.execute(
      `INSERT INTO produtos (nome, categoria_id, status_id, preco_unitario, perecivel)
       VALUES (?, ?, ?, ?, ?)`,
      [payload.nome, categoryId, STATUS_IDS.ATIVO, payload.preco_unitario, payload.perecivel ? 1 : 0]
    );
    const productId = productResult.insertId;

    await connection.execute(
      `INSERT INTO estoque (produto_id, quantidade, quantidade_minima, localizacao)
       VALUES (?, ?, ?, ?)`,
      [productId, payload.quantidade_estoque, payload.quantidade_minima ?? 0, payload.localizacao ?? null]
    );
    await addLotQuantity(connection, productId, lot.lote_id, payload.quantidade_estoque);

    if (payload.quantidade_estoque > 0) {
      await insertMovement(connection, {
        produtoId: productId,
        loteId: lot.lote_id,
        tipo: 'entrada',
        subtipo: null,
        quantidade: payload.quantidade_estoque,
        quantidadeAnterior: 0,
        quantidadeAtual: payload.quantidade_estoque,
        motivo: 'Cadastro inicial do produto',
      });
    }

    return getProductById(productId, connection);
  });
}

// Lots are changed only through stock entries; editing a product never touches them (RF-05).
async function updateProduct(productId, payload) {
  return withTransaction(async (connection) => {
    await lockProduct(connection, productId);
    const categoryId = await ensureCategory(connection, payload.categoria);

    await connection.execute(
      `UPDATE produtos
       SET nome = ?, categoria_id = ?, preco_unitario = ?, perecivel = ?
       WHERE id = ?`,
      [payload.nome, categoryId, payload.preco_unitario, payload.perecivel ? 1 : 0, productId]
    );

    await updateStockSettings(connection, productId, payload);

    return getProductById(productId, connection);
  });
}

// Only fields present in the payload are written; omitted fields keep their stored values,
// and an explicit null/empty localizacao clears it.
async function updateStockSettings(connection, productId, { quantidade_minima, localizacao }) {
  const assignments = [];
  const values = [];

  if (quantidade_minima !== undefined) {
    assignments.push('quantidade_minima = ?');
    values.push(quantidade_minima);
  }

  if (localizacao !== undefined) {
    assignments.push('localizacao = ?');
    values.push(localizacao);
  }

  if (assignments.length === 0) {
    return;
  }

  await connection.execute(`UPDATE estoque SET ${assignments.join(', ')} WHERE produto_id = ?`, [...values, productId]);
}

async function setProductStatus(connection, productId, statusId) {
  await connection.execute('UPDATE produtos SET status_id = ? WHERE id = ?', [statusId, productId]);
}

async function setProductActive(productId, active) {
  return withTransaction(async (connection) => {
    await lockProduct(connection, productId);
    await setProductStatus(connection, productId, active ? STATUS_IDS.ATIVO : STATUS_IDS.INATIVO);
    return getProductById(productId, connection);
  });
}

// A product with stock history is inactivated instead of deleted, so the history is kept (RF-10).
async function deleteProduct(productId) {
  return withTransaction(async (connection) => {
    await lockProduct(connection, productId);

    const movementCount = await countProductMovements(connection, productId);
    if (movementCount > 0) {
      await setProductStatus(connection, productId, STATUS_IDS.INATIVO);
      return { deleted: false, deactivated: true };
    }

    await connection.execute('DELETE FROM produtos WHERE id = ?', [productId]);
    return { deleted: true, deactivated: false };
  });
}

module.exports = {
  listProducts,
  getProductById,
  lockProduct,
  listCategories,
  createProduct,
  updateProduct,
  setProductActive,
  deleteProduct,
};

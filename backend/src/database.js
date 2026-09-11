const mysql = require('mysql2/promise');
const { NotFoundError, BusinessRuleError, ValidationError } = require('./errors');
const { calculateStatusId, isExpired } = require('./productStatus');

function getDbConfig() {
  return {
    client: 'mysql',
    connection: {
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      database: process.env.DB_DATABASE || 'hortifruti',
      user: process.env.DB_USERNAME || 'root',
      password: process.env.DB_PASSWORD || '',
      charset: process.env.DB_COLLATION || 'utf8mb4_general_ci',
      multipleStatements: true,
    },
  };
}

let pool;

async function initDatabase() {
  if (!pool) {
    const config = getDbConfig();
    pool = mysql.createPool(config.connection);

    const connection = await pool.getConnection();
    try {
      await connection.query('SELECT 1');
    } finally {
      connection.release();
    }
  }

  return pool;
}

async function withTransaction(callback) {
  const database = await initDatabase();
  const connection = await database.getConnection();

  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

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
  const database = await initDatabase();
  const [rows] = await database.execute(`${PRODUCT_SELECT} ORDER BY p.id ASC`);
  return rows;
}

async function getProductById(productId, executor) {
  const database = executor || (await initDatabase());
  const [rows] = await database.execute(`${PRODUCT_SELECT} WHERE p.id = ?`, [productId]);

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

async function ensureLote(connection, { codigoLote, dataValidade, dataEntrada }) {
  const normalizedCode = String(codigoLote).trim();
  const entrada = dataEntrada || new Date().toISOString().slice(0, 10);

  const [rows] = await connection.execute('SELECT id FROM lotes WHERE codigo_lote = ? LIMIT 1', [normalizedCode]);
  if (rows.length > 0) {
    await connection.execute('UPDATE lotes SET data_validade = ? WHERE id = ?', [dataValidade, rows[0].id]);
    return rows[0].id;
  }

  const [result] = await connection.execute(
    'INSERT INTO lotes (codigo_lote, data_entrada, data_validade) VALUES (?, ?, ?)',
    [normalizedCode, entrada, dataValidade]
  );
  return result.insertId;
}

async function createProduct(payload) {
  return withTransaction(async (connection) => {
    const categoryId = await ensureCategory(connection, payload.categoria);
    const loteId = await ensureLote(connection, {
      codigoLote: payload.codigo_lote,
      dataValidade: payload.data_validade,
      dataEntrada: payload.data_entrada,
    });

    const statusId = calculateStatusId({
      dataValidade: payload.data_validade,
      quantidade: payload.quantidade_estoque,
    });

    const [productResult] = await connection.execute(
      `INSERT INTO produtos (nome, categoria_id, lote_id, status_id, preco_unitario, perecivel)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [payload.nome, categoryId, loteId, statusId, payload.preco_unitario, payload.perecivel ? 1 : 0]
    );
    const productId = productResult.insertId;

    await connection.execute(
      `INSERT INTO estoque (produto_id, quantidade, quantidade_minima, localizacao)
       VALUES (?, ?, ?, ?)`,
      [productId, payload.quantidade_estoque, payload.quantidade_minima || 0, payload.localizacao || null]
    );

    if (payload.quantidade_estoque > 0) {
      await insertMovement(connection, {
        produtoId: productId,
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

async function updateProduct(productId, payload) {
  return withTransaction(async (connection) => {
    const [existingRows] = await connection.execute(
      'SELECT p.id, e.quantidade AS quantidade_estoque FROM produtos p LEFT JOIN estoque e ON e.produto_id = p.id WHERE p.id = ? LIMIT 1 FOR UPDATE',
      [productId]
    );

    if (existingRows.length === 0) {
      throw new NotFoundError('Produto não encontrado');
    }

    const currentQuantity = existingRows[0].quantidade_estoque || 0;
    const categoryId = await ensureCategory(connection, payload.categoria);
    const loteId = await ensureLote(connection, {
      codigoLote: payload.codigo_lote,
      dataValidade: payload.data_validade,
      dataEntrada: payload.data_entrada,
    });

    const statusId = calculateStatusId({ dataValidade: payload.data_validade, quantidade: currentQuantity });

    await connection.execute(
      `UPDATE produtos
       SET nome = ?, categoria_id = ?, lote_id = ?, status_id = ?, preco_unitario = ?, perecivel = ?
       WHERE id = ?`,
      [payload.nome, categoryId, loteId, statusId, payload.preco_unitario, payload.perecivel ? 1 : 0, productId]
    );

    if (payload.quantidade_minima !== undefined || payload.localizacao !== undefined) {
      await connection.execute(
        'UPDATE estoque SET quantidade_minima = COALESCE(?, quantidade_minima), localizacao = COALESCE(?, localizacao) WHERE produto_id = ?',
        [payload.quantidade_minima, payload.localizacao, productId]
      );
    }

    return getProductById(productId, connection);
  });
}

async function deleteProduct(productId) {
  const database = await initDatabase();
  const [result] = await database.execute('DELETE FROM produtos WHERE id = ?', [productId]);

  if (result.affectedRows === 0) {
    throw new NotFoundError('Produto não encontrado');
  }

  return true;
}

async function insertMovement(connection, movement) {
  await connection.execute(
    `INSERT INTO movimentacoes_estoque
      (produto_id, tipo, subtipo, quantidade, quantidade_anterior, quantidade_atual, motivo)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      movement.produtoId,
      movement.tipo,
      movement.subtipo,
      movement.quantidade,
      movement.quantidadeAnterior,
      movement.quantidadeAtual,
      movement.motivo || null,
    ]
  );
}

async function lockProductStockRow(connection, productId) {
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

  if (rows.length === 0) {
    throw new NotFoundError('Produto não encontrado');
  }

  return rows[0];
}

async function updateStockAndStatus(connection, productId, { newQuantity, dataValidade }) {
  await connection.execute('UPDATE estoque SET quantidade = ? WHERE produto_id = ?', [newQuantity, productId]);

  const statusId = calculateStatusId({ dataValidade, quantidade: newQuantity });
  await connection.execute('UPDATE produtos SET status_id = ? WHERE id = ?', [statusId, productId]);
}

async function registerStockEntry(productId, { quantidade, motivo }) {
  return withTransaction(async (connection) => {
    const current = await lockProductStockRow(connection, productId);
    const previousQuantity = current.quantidade || 0;
    const newQuantity = previousQuantity + quantidade;

    await updateStockAndStatus(connection, productId, { newQuantity, dataValidade: current.data_validade });
    await insertMovement(connection, {
      produtoId: productId,
      tipo: 'entrada',
      subtipo: null,
      quantidade,
      quantidadeAnterior: previousQuantity,
      quantidadeAtual: newQuantity,
      motivo,
    });

    return getProductById(productId, connection);
  });
}

async function registerStockExit(productId, { quantidade, motivo, subtipo }) {
  return withTransaction(async (connection) => {
    const current = await lockProductStockRow(connection, productId);
    const previousQuantity = current.quantidade || 0;

    if (subtipo === 'venda' && isExpired(current.data_validade)) {
      throw new BusinessRuleError('Não é permitido registrar venda de produto vencido');
    }

    if (quantidade > previousQuantity) {
      throw new ValidationError('Quantidade em estoque insuficiente para essa saída');
    }

    const newQuantity = previousQuantity - quantidade;

    await updateStockAndStatus(connection, productId, { newQuantity, dataValidade: current.data_validade });
    await insertMovement(connection, {
      produtoId: productId,
      tipo: 'saida',
      subtipo,
      quantidade,
      quantidadeAnterior: previousQuantity,
      quantidadeAtual: newQuantity,
      motivo,
    });

    return getProductById(productId, connection);
  });
}

async function listMovements(productId) {
  const database = await initDatabase();
  await getProductById(productId, database);

  const [rows] = await database.execute(
    `SELECT id, tipo, subtipo, quantidade, quantidade_anterior, quantidade_atual, motivo, data_movimentacao
     FROM movimentacoes_estoque
     WHERE produto_id = ?
     ORDER BY data_movimentacao DESC, id DESC`,
    [productId]
  );

  return rows;
}

module.exports = {
  getDbConfig,
  initDatabase,
  listProducts,
  getProductById,
  listCategories,
  createProduct,
  updateProduct,
  deleteProduct,
  registerStockEntry,
  registerStockExit,
  listMovements,
};

const database = require('../database');

async function listCategories() {
  const executor = await database.initDatabase();
  const [rows] = await executor.execute('SELECT id, nome, descricao FROM categorias ORDER BY nome ASC');
  return rows;
}

async function findCategoryByName(connection, categoryName) {
  const [rows] = await connection.execute('SELECT id FROM categorias WHERE nome = ? LIMIT 1', [categoryName]);
  return rows[0] || null;
}

async function createCategory(connection, categoryName) {
  const [result] = await connection.execute(
    'INSERT INTO categorias (nome, descricao) VALUES (?, ?)',
    [categoryName, `Categoria ${categoryName}`]
  );
  return result.insertId;
}

module.exports = { listCategories, findCategoryByName, createCategory };

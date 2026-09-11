const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/database');

test('database config reads MySQL settings from environment', () => {
  const config = db.getDbConfig();

  assert.equal(config.client, 'mysql');
  assert.equal(config.connection.host, '127.0.0.1');
  assert.equal(config.connection.port, 3306);
  assert.equal(config.connection.database, 'hortifruti');
  assert.equal(config.connection.user, 'root');
  assert.equal(config.connection.password, '');
});

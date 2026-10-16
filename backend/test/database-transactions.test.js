const { test, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const database = require('../src/database');

const pool = { getConnection: async () => ({ query: async () => {}, release() {} }) };
mock.method(mysql, 'createPool', () => pool);
before(() => database.initDatabase());
after(() => mock.restoreAll());

function trackTransaction(t, { commitError } = {}) {
  const events = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async commit() {
      events.push('commit');
      if (commitError) throw commitError;
    },
    async rollback() { events.push('rollback'); },
    release() { events.push('release'); },
  };
  t.mock.method(pool, 'getConnection', async () => connection);
  return { connection, events };
}

test('withTransaction commits the callback result and releases its connection', async (t) => {
  const { connection, events } = trackTransaction(t);
  const result = await database.withTransaction(async (executor) => {
    assert.equal(executor, connection);
    events.push('write');
    return { id: 12 };
  });

  assert.deepEqual(result, { id: 12 });
  assert.deepEqual(events, ['begin', 'write', 'commit', 'release']);
});

test('withTransaction rolls back a failed write and preserves the error', async (t) => {
  const { events } = trackTransaction(t);
  const failure = new Error('Movement could not be persisted');

  await assert.rejects(database.withTransaction(async () => { throw failure; }), (error) => error === failure);
  assert.deepEqual(events, ['begin', 'rollback', 'release']);
});

test('withTransaction releases the connection when the commit fails', async (t) => {
  const failure = new Error('Commit failed');
  const { events } = trackTransaction(t, { commitError: failure });

  await assert.rejects(database.withTransaction(async () => true), (error) => error === failure);
  assert.deepEqual(events, ['begin', 'commit', 'rollback', 'release']);
});

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseJsonText } = require('../src/httpUtils');
const { ValidationError } = require('../src/errors');

test('parseJsonText parses a JSON object', () => {
  assert.deepEqual(parseJsonText('{"nome":"Maçã"}'), { nome: 'Maçã' });
});

test('parseJsonText returns an empty object for an empty body', () => {
  assert.deepEqual(parseJsonText(''), {});
});

test('parseJsonText rejects malformed JSON with a 400 validation error', () => {
  assert.throws(
    () => parseJsonText('{"nome":'),
    (error) => error instanceof ValidationError && error.statusCode === 400
  );
});

test('parseJsonText rejects JSON that is not an object', () => {
  assert.throws(() => parseJsonText('[1, 2]'), ValidationError);
  assert.throws(() => parseJsonText('null'), ValidationError);
});

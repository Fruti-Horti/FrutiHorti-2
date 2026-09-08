const test = require('node:test');
const assert = require('node:assert/strict');

const { STATUS_IDS, isExpired, daysUntilExpiration, calculateStatusId } = require('../src/productStatus');

test('isExpired returns true when the expiration date is before the reference date', () => {
  assert.equal(isExpired('2026-08-01', new Date('2026-08-02T00:00:00Z')), true);
});

test('isExpired returns false when the expiration date is the same as the reference date', () => {
  assert.equal(isExpired('2026-08-02', new Date('2026-08-02T00:00:00Z')), false);
});

test('isExpired returns false when the expiration date is in the future', () => {
  assert.equal(isExpired('2026-09-10', new Date('2026-08-02T00:00:00Z')), false);
});

test('daysUntilExpiration counts whole days between reference and expiration', () => {
  assert.equal(daysUntilExpiration('2026-08-10', new Date('2026-08-02T00:00:00Z')), 8);
  assert.equal(daysUntilExpiration('2026-08-01', new Date('2026-08-02T00:00:00Z')), -1);
});

test('calculateStatusId marks expired products as vencido even with stock available', () => {
  const statusId = calculateStatusId(
    { dataValidade: '2026-08-01', quantidade: 50 },
    new Date('2026-08-02T00:00:00Z')
  );
  assert.equal(statusId, STATUS_IDS.VENCIDO);
});

test('calculateStatusId marks products with zero stock as esgotado', () => {
  const statusId = calculateStatusId(
    { dataValidade: '2026-12-01', quantidade: 0 },
    new Date('2026-08-02T00:00:00Z')
  );
  assert.equal(statusId, STATUS_IDS.ESGOTADO);
});

test('calculateStatusId marks products with stock and valid date as ativo', () => {
  const statusId = calculateStatusId(
    { dataValidade: '2026-12-01', quantidade: 10 },
    new Date('2026-08-02T00:00:00Z')
  );
  assert.equal(statusId, STATUS_IDS.ATIVO);
});

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  STATUS_IDS,
  isValidDateString,
  getStoreToday,
  isExpired,
  daysUntilExpiration,
  calculateStatusId,
  describeProduct,
} = require('../src/productStatus');

// Instants are written with an explicit offset so the tests do not depend on the machine's time zone.
const NOON_IN_BRASILIA = new Date('2026-08-02T12:00:00-03:00');
const TEN_PM_IN_BRASILIA = new Date('2026-10-14T22:00:00-03:00');

test('getStoreToday uses the store time zone, not UTC', () => {
  // 22h in Brasília is already the next day in UTC.
  assert.equal(TEN_PM_IN_BRASILIA.toISOString().slice(0, 10), '2026-10-15');
  assert.equal(getStoreToday(TEN_PM_IN_BRASILIA), '2026-10-14');
});

test('isExpired returns true when the expiration date is before today', () => {
  assert.equal(isExpired('2026-08-01', NOON_IN_BRASILIA), true);
});

test('isExpired returns true on the expiration day (rule: expiration <= today blocks sale)', () => {
  assert.equal(isExpired('2026-08-02', NOON_IN_BRASILIA), true);
});

test('isExpired returns false when the expiration date is in the future', () => {
  assert.equal(isExpired('2026-09-10', NOON_IN_BRASILIA), false);
});

test('isExpired between 21h and 24h in Brasília still uses the local day', () => {
  assert.equal(isExpired('2026-10-15', TEN_PM_IN_BRASILIA), false);
  assert.equal(isExpired('2026-10-14', TEN_PM_IN_BRASILIA), true);
});

test('daysUntilExpiration counts whole days between today and expiration', () => {
  assert.equal(daysUntilExpiration('2026-08-10', NOON_IN_BRASILIA), 8);
  assert.equal(daysUntilExpiration('2026-08-01', NOON_IN_BRASILIA), -1);
});

test('daysUntilExpiration at 22h in Brasília returns 1 for tomorrow', () => {
  assert.equal(daysUntilExpiration('2026-10-15', TEN_PM_IN_BRASILIA), 1);
  assert.equal(daysUntilExpiration('2026-10-14', TEN_PM_IN_BRASILIA), 0);
});

test('isValidDateString rejects impossible calendar dates', () => {
  assert.equal(isValidDateString('2026-02-28'), true);
  assert.equal(isValidDateString('2028-02-29'), true);
  assert.equal(isValidDateString('2026-02-31'), false);
  assert.equal(isValidDateString('2026-13-01'), false);
  assert.equal(isValidDateString('05/09/2026'), false);
});

test('calculateStatusId marks expired products as vencido even with stock available', () => {
  const statusId = calculateStatusId({ dataValidade: '2026-08-01', quantidade: 50 }, NOON_IN_BRASILIA);
  assert.equal(statusId, STATUS_IDS.VENCIDO);
});

test('calculateStatusId marks products with zero stock as esgotado', () => {
  const statusId = calculateStatusId({ dataValidade: '2026-12-01', quantidade: 0 }, NOON_IN_BRASILIA);
  assert.equal(statusId, STATUS_IDS.ESGOTADO);
});

test('calculateStatusId marks products with stock and valid date as ativo', () => {
  const statusId = calculateStatusId({ dataValidade: '2026-12-01', quantidade: 10 }, NOON_IN_BRASILIA);
  assert.equal(statusId, STATUS_IDS.ATIVO);
});

const storedProduct = {
  id: 1,
  status: 'ativo',
  data_entrada: '2026-07-25',
  data_validade: '2026-08-01',
  quantidade_estoque: 30,
  quantidade_minima: 10,
};

test('describeProduct derives vencido at read time even if the stored status is ativo', () => {
  const product = describeProduct(storedProduct, NOON_IN_BRASILIA);
  assert.equal(product.status, 'vencido');
  assert.equal(product.dias_para_vencer, -1);
  assert.equal(product.proximo_do_vencimento, false);
});

test('describeProduct flags products expiring within the threshold', () => {
  const product = describeProduct({ ...storedProduct, data_validade: '2026-08-04' }, NOON_IN_BRASILIA);
  assert.equal(product.status, 'ativo');
  assert.equal(product.dias_para_vencer, 2);
  assert.equal(product.proximo_do_vencimento, true);
});

test('describeProduct flags low stock and esgotado', () => {
  const product = describeProduct({ ...storedProduct, data_validade: '2026-12-01', quantidade_estoque: 0 }, NOON_IN_BRASILIA);
  assert.equal(product.status, 'esgotado');
  assert.equal(product.estoque_baixo, true);
});

test('describeProduct keeps an inactive product inactive', () => {
  const product = describeProduct({ ...storedProduct, status: 'inativo' }, NOON_IN_BRASILIA);
  assert.equal(product.status, 'inativo');
});

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isValidDateString,
  getStoreToday,
  isExpired,
  daysUntilExpiration,
  sortLotsByExpiration,
  selectReferenceLot,
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

const product = { id: 1, status: 'ativo', quantidade_minima: 10 };

function lot(loteId, dataValidade, quantidade) {
  return { lote_id: loteId, codigo_lote: `L${loteId}`, data_entrada: '2026-07-25', data_validade: dataValidade, quantidade };
}

test('sortLotsByExpiration orders lots by earliest expiration first', () => {
  const sorted = sortLotsByExpiration([lot(1, '2026-08-20', 5), lot(2, '2026-08-05', 5), lot(3, '2026-08-05', 5)]);
  assert.deepEqual(sorted.map((item) => item.lote_id), [2, 3, 1]);
});

test('selectReferenceLot prefers the next sellable lot with stock', () => {
  const sorted = sortLotsByExpiration([lot(1, '2026-08-01', 5), lot(2, '2026-08-09', 0), lot(3, '2026-08-20', 5)]);
  assert.equal(selectReferenceLot(sorted, NOON_IN_BRASILIA).lote_id, 3);
});

test('selectReferenceLot falls back to the freshest lot when there is no stock', () => {
  const sorted = sortLotsByExpiration([lot(1, '2026-08-01', 0), lot(2, '2026-08-20', 0)]);
  assert.equal(selectReferenceLot(sorted, NOON_IN_BRASILIA).lote_id, 2);
});

test('describeProduct derives vencido at read time when all stock is expired', () => {
  const described = describeProduct(product, [lot(1, '2026-08-01', 30)], NOON_IN_BRASILIA);
  assert.equal(described.status, 'vencido');
  assert.equal(described.dias_para_vencer, -1);
  assert.equal(described.quantidade_vencida, 30);
  assert.equal(described.proximo_do_vencimento, false);
});

test('describeProduct stays ativo when an expired lot coexists with a valid one', () => {
  const described = describeProduct(product, [lot(1, '2026-08-01', 5), lot(2, '2026-08-20', 25)], NOON_IN_BRASILIA);
  assert.equal(described.status, 'ativo');
  assert.equal(described.quantidade_estoque, 30);
  assert.equal(described.quantidade_vencida, 5);
  assert.equal(described.codigo_lote, 'L2');
  assert.equal(described.data_validade, '2026-08-20');
  assert.equal(described.lotes.length, 2);
});

test('describeProduct flags products expiring within the threshold', () => {
  const described = describeProduct(product, [lot(1, '2026-08-04', 30)], NOON_IN_BRASILIA);
  assert.equal(described.status, 'ativo');
  assert.equal(described.dias_para_vencer, 2);
  assert.equal(described.proximo_do_vencimento, true);
});

test('describeProduct marks a product without stock as esgotado with low stock', () => {
  const described = describeProduct(product, [lot(1, '2026-12-01', 0)], NOON_IN_BRASILIA);
  assert.equal(described.status, 'esgotado');
  assert.equal(described.estoque_baixo, true);
});

test('describeProduct keeps an inactive product inactive', () => {
  const described = describeProduct({ ...product, status: 'inativo' }, [lot(1, '2026-08-20', 30)], NOON_IN_BRASILIA);
  assert.equal(described.status, 'inativo');
});

test('describeProduct handles a product without lots', () => {
  const described = describeProduct(product, [], NOON_IN_BRASILIA);
  assert.equal(described.status, 'esgotado');
  assert.equal(described.data_validade, null);
  assert.equal(described.dias_para_vencer, null);
});

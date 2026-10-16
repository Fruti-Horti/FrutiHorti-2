const test = require('node:test');
const assert = require('node:assert/strict');

const { assertProductCanBeSold, assertStockEntryAllowed, planStockExit } = require('../src/stockRules');
const { BusinessRuleError, ValidationError } = require('../src/errors');

const NOON_IN_BRASILIA = new Date('2026-10-14T12:00:00-03:00');
const TEN_PM_IN_BRASILIA = new Date('2026-10-14T22:00:00-03:00');

function lot(loteId, dataValidade, quantidade) {
  return { lote_id: loteId, codigo_lote: `L${loteId}`, data_validade: dataValidade, quantidade };
}

function quantitiesByLot(allocations) {
  return allocations.map(({ lote_id, quantidade }) => [lote_id, quantidade]);
}

// Acceptance scenario RF-08/RF-09: lot A expires in 2 days (10 units), lot B in 9 days (30 units).
const LOT_A = lot(1, '2026-10-16', 10);
const LOT_B = lot(2, '2026-10-23', 30);

test('a sale consumes the lot with the earliest expiration first (FEFO)', () => {
  const allocations = planStockExit([LOT_B, LOT_A], { quantidade: 15, subtipo: 'venda' }, NOON_IN_BRASILIA);
  assert.deepEqual(quantitiesByLot(allocations), [[1, 10], [2, 5]]);
});

test('a sale never consumes an expired lot', () => {
  const expiredA = lot(1, '2026-10-10', 10);
  const allocations = planStockExit([expiredA, LOT_B], { quantidade: 15, subtipo: 'venda' }, NOON_IN_BRASILIA);
  assert.deepEqual(quantitiesByLot(allocations), [[2, 15]]);
});

test('a sale of a product whose stock is all expired is blocked with a business rule error', () => {
  assert.throws(
    () => planStockExit([lot(1, '2026-10-13', 10)], { quantidade: 5, subtipo: 'venda' }, NOON_IN_BRASILIA),
    (error) => error instanceof BusinessRuleError && error.statusCode === 422
  );
});

test('a sale on the expiration day is blocked', () => {
  assert.throws(
    () => planStockExit([lot(1, '2026-10-14', 10)], { quantidade: 5, subtipo: 'venda' }, NOON_IN_BRASILIA),
    BusinessRuleError
  );
});

test('a sale at 22h in Brasília uses the local day, not the UTC day', () => {
  // In UTC it is already 2026-10-15, but the lot expiring on the 15th can still be sold on the 14th.
  assert.doesNotThrow(() =>
    planStockExit([lot(1, '2026-10-15', 10)], { quantidade: 5, subtipo: 'venda' }, TEN_PM_IN_BRASILIA)
  );
  assert.throws(
    () => planStockExit([lot(1, '2026-10-14', 10)], { quantidade: 5, subtipo: 'venda' }, TEN_PM_IN_BRASILIA),
    BusinessRuleError
  );
});

test('a sale larger than the non-expired stock is rejected even if expired stock would cover it', () => {
  const expiredA = lot(1, '2026-10-10', 10);
  assert.throws(
    () => planStockExit([expiredA, LOT_B], { quantidade: 35, subtipo: 'venda' }, NOON_IN_BRASILIA),
    (error) => error instanceof ValidationError && /disponível 30/.test(error.message)
  );
});

test('a loss exit consumes expired lots first', () => {
  const expiredA = lot(1, '2026-10-10', 10);
  const allocations = planStockExit([LOT_B, expiredA], { quantidade: 12, subtipo: 'perda' }, NOON_IN_BRASILIA);
  assert.deepEqual(quantitiesByLot(allocations), [[1, 10], [2, 2]]);
});

test('an exit larger than the current stock is rejected', () => {
  assert.throws(
    () => planStockExit([LOT_A], { quantidade: 11, subtipo: 'perda' }, NOON_IN_BRASILIA),
    (error) => error instanceof ValidationError && error.statusCode === 400
  );
});

test('lots without stock are skipped', () => {
  const emptyLot = lot(3, '2026-10-15', 0);
  const allocations = planStockExit([emptyLot, LOT_A], { quantidade: 4, subtipo: 'venda' }, NOON_IN_BRASILIA);
  assert.deepEqual(quantitiesByLot(allocations), [[1, 4]]);
});

test('an inactive product cannot be sold', () => {
  assert.throws(() => assertProductCanBeSold('inativo'), BusinessRuleError);
  assert.doesNotThrow(() => assertProductCanBeSold('ativo'));
});

test('stock cannot be added to an expired lot', () => {
  assert.throws(() => assertStockEntryAllowed(lot(1, '2026-10-14', 0), NOON_IN_BRASILIA), BusinessRuleError);
  assert.doesNotThrow(() => assertStockEntryAllowed(LOT_A, NOON_IN_BRASILIA));
});

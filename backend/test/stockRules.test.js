const test = require('node:test');
const assert = require('node:assert/strict');

const { assertStockExitAllowed } = require('../src/stockRules');
const { BusinessRuleError, ValidationError } = require('../src/errors');

const NOON_IN_BRASILIA = new Date('2026-10-14T12:00:00-03:00');
const TEN_PM_IN_BRASILIA = new Date('2026-10-14T22:00:00-03:00');

function exitOf(overrides) {
  return { subtipo: 'venda', dataValidade: '2026-10-20', currentQuantity: 10, quantidade: 5, ...overrides };
}

test('a sale of a product within its expiration date is allowed', () => {
  assert.doesNotThrow(() => assertStockExitAllowed(exitOf(), NOON_IN_BRASILIA));
});

test('a sale of an expired product is blocked with a business rule error', () => {
  assert.throws(
    () => assertStockExitAllowed(exitOf({ dataValidade: '2026-10-13' }), NOON_IN_BRASILIA),
    (error) => error instanceof BusinessRuleError && error.statusCode === 422
  );
});

test('a sale on the expiration day is blocked', () => {
  assert.throws(
    () => assertStockExitAllowed(exitOf({ dataValidade: '2026-10-14' }), NOON_IN_BRASILIA),
    BusinessRuleError
  );
});

test('a sale at 22h in Brasília uses the local day, not the UTC day', () => {
  // In UTC it is already 2026-10-15, but the product expiring on the 15th can still be sold on the 14th.
  assert.doesNotThrow(() => assertStockExitAllowed(exitOf({ dataValidade: '2026-10-15' }), TEN_PM_IN_BRASILIA));
  assert.throws(
    () => assertStockExitAllowed(exitOf({ dataValidade: '2026-10-14' }), TEN_PM_IN_BRASILIA),
    BusinessRuleError
  );
});

test('a loss exit of an expired product is still allowed', () => {
  assert.doesNotThrow(() =>
    assertStockExitAllowed(exitOf({ subtipo: 'perda', dataValidade: '2026-10-01' }), NOON_IN_BRASILIA)
  );
});

test('an exit larger than the current stock is rejected', () => {
  assert.throws(
    () => assertStockExitAllowed(exitOf({ quantidade: 11 }), NOON_IN_BRASILIA),
    (error) => error instanceof ValidationError && error.statusCode === 400
  );
});

// Critical business rule: a product whose expiration date is on or before today cannot be sold.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const stockService = require('../src/services/stockService');
const stockHandlers = require('../src/handlers/stock');
const { STATUS_IDS, isSaleBlockedByExpiration } = require('../src/productStatus');
const { BusinessRuleError } = require('../src/errors');
const { MOCK_PRODUCT_ID, prepareStock } = require('./helpers/stockMocks');

const TODAY = '2026-10-16';
const YESTERDAY = '2026-10-15';
const TOMORROW = '2026-10-17';
const FROZEN_NOW = new Date(`${TODAY}T12:00:00Z`);
const EXPIRED_SALE_MESSAGE = 'Não é permitido registrar venda de produto vencido';
const NON_SALE_EXIT_SUBTYPES = ['perda', 'ajuste', 'outro'];

function freezeClock(t) {
  t.mock.timers.enable({ apis: ['Date'], now: FROZEN_NOW });
}

function sellTwoUnits() {
  return stockService.registerStockExit(MOCK_PRODUCT_ID, { quantidade: 2, subtipo: 'venda' });
}

async function assertSaleRejectedWithoutWrites(state) {
  await assert.rejects(sellTwoUnits(), (error) => {
    assert.ok(error instanceof BusinessRuleError);
    assert.equal(error.statusCode, 422);
    assert.equal(error.message, EXPIRED_SALE_MESSAGE);
    return true;
  });
  assert.equal(state.quantity, 10);
  assert.equal(state.writes, 0);
  assert.deepEqual(state.movements, []);
}

function createJsonRequest(body) {
  return Readable.from([JSON.stringify(body)]);
}

function createResponseRecorder() {
  return {
    statusCode: null,
    body: null,
    writeHead(statusCode) {
      this.statusCode = statusCode;
    },
    end(rawBody) {
      this.body = JSON.parse(rawBody);
    },
  };
}

test('isSaleBlockedByExpiration blocks products that expired before the reference date', () => {
  assert.equal(isSaleBlockedByExpiration(YESTERDAY, FROZEN_NOW), true);
  assert.equal(isSaleBlockedByExpiration('2000-01-01', FROZEN_NOW), true);
});

test('isSaleBlockedByExpiration blocks products that expire on the reference date', () => {
  assert.equal(isSaleBlockedByExpiration(TODAY, FROZEN_NOW), true);
});

test('isSaleBlockedByExpiration allows products that expire after the reference date', () => {
  assert.equal(isSaleBlockedByExpiration(TOMORROW, FROZEN_NOW), false);
  assert.equal(isSaleBlockedByExpiration('2099-01-01', FROZEN_NOW), false);
});

test('isSaleBlockedByExpiration ignores the time of day of the reference date', () => {
  assert.equal(isSaleBlockedByExpiration(TODAY, new Date(`${TODAY}T00:00:00Z`)), true);
  assert.equal(isSaleBlockedByExpiration(TODAY, new Date(`${TODAY}T23:59:59Z`)), true);
  assert.equal(isSaleBlockedByExpiration(TOMORROW, new Date(`${TODAY}T23:59:59Z`)), false);
});

test('isSaleBlockedByExpiration accepts Date values as returned by the MySQL driver', () => {
  assert.equal(isSaleBlockedByExpiration(new Date(`${TODAY}T00:00:00Z`), FROZEN_NOW), true);
  assert.equal(isSaleBlockedByExpiration(new Date(`${TOMORROW}T00:00:00Z`), FROZEN_NOW), false);
});

test('isSaleBlockedByExpiration throws on an invalid expiration date instead of allowing the sale', () => {
  assert.throws(() => isSaleBlockedByExpiration('not-a-date', FROZEN_NOW), /Data inválida/);
});

test('selling a product that expired yesterday is rejected without changing stock or history', async (t) => {
  freezeClock(t);
  const state = prepareStock(t, { expirationDate: YESTERDAY });
  await assertSaleRejectedWithoutWrites(state);
});

test('selling a product that expires today is rejected without changing stock or history', async (t) => {
  freezeClock(t);
  const state = prepareStock(t, { expirationDate: TODAY });
  await assertSaleRejectedWithoutWrites(state);
});

test('selling a product whose expiration date comes from MySQL as a Date is rejected', async (t) => {
  freezeClock(t);
  const state = prepareStock(t, { expirationDate: new Date(`${TODAY}T00:00:00Z`) });
  await assertSaleRejectedWithoutWrites(state);
});

test('selling a product that expires tomorrow is allowed', async (t) => {
  freezeClock(t);
  const state = prepareStock(t, { expirationDate: TOMORROW });
  const product = await sellTwoUnits();

  assert.equal(product.quantidade_estoque, 8);
  assert.equal(state.statusId, STATUS_IDS.ATIVO);
  assert.equal(state.movements.length, 1);
  assert.equal(state.movements[0].subtype, 'venda');
});

test('the expiration rule is checked before the available quantity', async (t) => {
  freezeClock(t);
  const state = prepareStock(t, { quantity: 1, expirationDate: YESTERDAY });
  await assert.rejects(
    stockService.registerStockExit(MOCK_PRODUCT_ID, { quantidade: 5, subtipo: 'venda' }),
    BusinessRuleError
  );
  assert.equal(state.writes, 0);
});

for (const subtype of NON_SALE_EXIT_SUBTYPES) {
  test(`expired products can still leave stock with the "${subtype}" subtype`, async (t) => {
    freezeClock(t);
    const state = prepareStock(t, { expirationDate: YESTERDAY });
    await stockService.registerStockExit(MOCK_PRODUCT_ID, { quantidade: 2, subtipo: subtype });

    assert.equal(state.quantity, 8);
    assert.equal(state.statusId, STATUS_IDS.VENCIDO);
    assert.equal(state.movements[0].subtype, subtype);
  });
}

test('POST /products/:id/stock/exits rejects the sale of an expired product with HTTP 422', async (t) => {
  freezeClock(t);
  const state = prepareStock(t, { expirationDate: TODAY });
  const req = createJsonRequest({ quantidade: 2, subtipo: 'venda' });
  const res = createResponseRecorder();

  await assert.rejects(stockHandlers.registerStockExit(req, res, [String(MOCK_PRODUCT_ID)]), (error) => {
    assert.ok(error instanceof BusinessRuleError);
    assert.equal(error.statusCode, 422);
    return true;
  });
  assert.equal(res.statusCode, null);
  assert.equal(state.writes, 0);
});

test('POST /products/:id/stock/exits accepts the sale of a product within its expiration date', async (t) => {
  freezeClock(t);
  prepareStock(t, { expirationDate: TOMORROW });
  const req = createJsonRequest({ quantidade: 2, subtipo: 'venda' });
  const res = createResponseRecorder();

  await stockHandlers.registerStockExit(req, res, [String(MOCK_PRODUCT_ID)]);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.item.quantidade_estoque, 8);
});

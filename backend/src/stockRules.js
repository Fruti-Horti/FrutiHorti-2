const { BusinessRuleError, ValidationError } = require('./errors');
const { STATUS_IDS, STATUS_NAMES, isExpired, sortLotsByExpiration } = require('./productStatus');

const SALE_SUBTYPE = 'venda';

function assertProductCanBeSold(productStatus) {
  if (productStatus === STATUS_NAMES[STATUS_IDS.INATIVO]) {
    throw new BusinessRuleError('Produto inativo não aceita venda');
  }
}

// PO decision 3: stock can't be added to an expired lot.
function assertStockEntryAllowed(lot, referenceDate = new Date()) {
  if (isExpired(lot.data_validade, referenceDate)) {
    throw new BusinessRuleError(`Não é permitido registrar entrada no lote vencido ${lot.codigo_lote}`);
  }
}

function allocateFefo(sortedLots, quantidade) {
  const allocations = [];
  let remaining = quantidade;

  for (const lot of sortedLots) {
    if (remaining === 0) break;

    const taken = Math.min(Number(lot.quantidade), remaining);
    if (taken > 0) {
      allocations.push({ lote_id: lot.lote_id, codigo_lote: lot.codigo_lote, quantidade: taken });
      remaining -= taken;
    }
  }

  return allocations;
}

// Plans which lots an exit consumes, earliest expiration first (FEFO).
// Critical business rule: a sale never consumes an expired lot. Other exits (loss, adjustment)
// may consume expired lots, so expired stock can be written off.
function planStockExit(lots, { quantidade, subtipo }, referenceDate = new Date()) {
  const lotsWithStock = sortLotsByExpiration(lots).filter((lot) => Number(lot.quantidade) > 0);
  const isSale = subtipo === SALE_SUBTYPE;
  const usableLots = isSale
    ? lotsWithStock.filter((lot) => !isExpired(lot.data_validade, referenceDate))
    : lotsWithStock;

  const available = usableLots.reduce((total, lot) => total + Number(lot.quantidade), 0);

  if (isSale && available === 0 && lotsWithStock.length > 0) {
    throw new BusinessRuleError('Não é permitido registrar venda de produto vencido');
  }

  if (quantidade > available) {
    const detail = isSale ? ' (lotes vencidos não podem ser vendidos)' : '';
    throw new ValidationError(`Quantidade em estoque insuficiente para essa saída: disponível ${available}${detail}`);
  }

  return allocateFefo(usableLots, quantidade);
}

module.exports = { SALE_SUBTYPE, assertProductCanBeSold, assertStockEntryAllowed, planStockExit };

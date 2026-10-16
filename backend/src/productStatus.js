const STATUS_IDS = {
  ATIVO: 1,
  INATIVO: 2,
  ESGOTADO: 3,
  VENCIDO: 4,
};

const STATUS_NAMES = {
  [STATUS_IDS.ATIVO]: 'ativo',
  [STATUS_IDS.INATIVO]: 'inativo',
  [STATUS_IDS.ESGOTADO]: 'esgotado',
  [STATUS_IDS.VENCIDO]: 'vencido',
};

// "Today" is always computed in the store's time zone, never in UTC or in the server's zone.
const STORE_TIMEZONE = process.env.STORE_TIMEZONE || 'America/Sao_Paulo';

// Single threshold for the "expiring soon" warning, shared by every listing.
const EXPIRING_SOON_DAYS = Number(process.env.EXPIRING_SOON_DAYS || 3);

// AGENTS.md (section 4): sales are blocked when the expiration date is less than OR EQUAL to today.
// Pending PO confirmation (decision 1 / T02); set to false to allow sales on the expiration day.
const BLOCK_ON_EXPIRATION_DAY = true;

const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isValidDateString(value) {
  const match = DATE_ONLY_REGEX.exec(String(value));
  if (!match) {
    return false;
  }

  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function getStoreToday(referenceDate = new Date(), timeZone = STORE_TIMEZONE) {
  // The en-CA locale formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(referenceDate);
}

function toDateString(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error(`Data inválida: ${value}`);
    }
    return value.toISOString().slice(0, 10);
  }

  const text = String(value).slice(0, 10);
  if (!isValidDateString(text)) {
    throw new Error(`Data inválida: ${value}`);
  }
  return text;
}

function toUtcMidnight(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function daysUntilExpiration(dataValidade, referenceDate = new Date()) {
  const expiration = toUtcMidnight(toDateString(dataValidade));
  const today = toUtcMidnight(getStoreToday(referenceDate));
  return Math.round((expiration - today) / MS_PER_DAY);
}

function isExpired(dataValidade, referenceDate = new Date()) {
  const days = daysUntilExpiration(dataValidade, referenceDate);
  return BLOCK_ON_EXPIRATION_DAY ? days <= 0 : days < 0;
}

// FEFO order: first expired, first out. Ties keep the oldest lot first.
function sortLotsByExpiration(lots) {
  return [...lots].sort((first, second) => {
    const byDate = toDateString(first.data_validade).localeCompare(toDateString(second.data_validade));
    return byDate !== 0 ? byDate : first.lote_id - second.lote_id;
  });
}

// The lot shown as the product's "current" lot: the next sellable one, then any lot with stock,
// then the freshest lot when the product has no stock at all.
function selectReferenceLot(sortedLots, referenceDate = new Date()) {
  const withStock = sortedLots.filter((lot) => Number(lot.quantidade) > 0);
  const sellable = withStock.find((lot) => !isExpired(lot.data_validade, referenceDate));
  return sellable || withStock[0] || sortedLots[sortedLots.length - 1] || null;
}

function deriveStatusName({ storedStatus, totalQuantity, sellableQuantity }) {
  if (storedStatus === STATUS_NAMES[STATUS_IDS.INATIVO]) {
    return storedStatus;
  }

  if (totalQuantity <= 0) {
    return STATUS_NAMES[STATUS_IDS.ESGOTADO];
  }

  if (sellableQuantity <= 0) {
    return STATUS_NAMES[STATUS_IDS.VENCIDO];
  }

  return STATUS_NAMES[STATUS_IDS.ATIVO];
}

function describeLot(lot, referenceDate) {
  return {
    lote_id: lot.lote_id,
    codigo_lote: lot.codigo_lote,
    data_entrada: lot.data_entrada ? toDateString(lot.data_entrada) : null,
    data_validade: toDateString(lot.data_validade),
    quantidade: Number(lot.quantidade),
    dias_para_vencer: daysUntilExpiration(lot.data_validade, referenceDate),
    vencido: isExpired(lot.data_validade, referenceDate),
  };
}

function sumQuantities(lots) {
  return lots.reduce((total, lot) => total + lot.quantidade, 0);
}

// Derives every stock and date field at read time from the product's lots, so the status never
// depends on a stock movement. codigo_lote/data_validade/data_entrada describe the reference lot and
// keep the API contract used before stock by lot.
function describeProduct(product, lots, referenceDate = new Date()) {
  const describedLots = sortLotsByExpiration(lots).map((lot) => describeLot(lot, referenceDate));
  const totalQuantity = sumQuantities(describedLots);
  const expiredQuantity = sumQuantities(describedLots.filter((lot) => lot.vencido));
  const referenceLot = selectReferenceLot(describedLots, referenceDate);
  const dias = referenceLot ? referenceLot.dias_para_vencer : null;

  return {
    ...product,
    codigo_lote: referenceLot ? referenceLot.codigo_lote : null,
    data_entrada: referenceLot ? referenceLot.data_entrada : null,
    data_validade: referenceLot ? referenceLot.data_validade : null,
    quantidade_estoque: totalQuantity,
    quantidade_vencida: expiredQuantity,
    status: deriveStatusName({
      storedStatus: product.status,
      totalQuantity,
      sellableQuantity: totalQuantity - expiredQuantity,
    }),
    dias_para_vencer: dias,
    proximo_do_vencimento: dias !== null && dias >= 0 && dias <= EXPIRING_SOON_DAYS,
    estoque_baixo: totalQuantity <= Number(product.quantidade_minima || 0),
    lotes: describedLots,
  };
}

module.exports = {
  STATUS_IDS,
  STATUS_NAMES,
  STORE_TIMEZONE,
  EXPIRING_SOON_DAYS,
  isValidDateString,
  getStoreToday,
  toDateString,
  isExpired,
  daysUntilExpiration,
  sortLotsByExpiration,
  selectReferenceLot,
  deriveStatusName,
  describeProduct,
};

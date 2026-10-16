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

function calculateStatusId({ dataValidade, quantidade }, referenceDate = new Date()) {
  if (isExpired(dataValidade, referenceDate)) {
    return STATUS_IDS.VENCIDO;
  }

  if (Number(quantidade) <= 0) {
    return STATUS_IDS.ESGOTADO;
  }

  return STATUS_IDS.ATIVO;
}

// Derives every date-dependent field at read time, so the status never depends on a stock movement.
function describeProduct(product, referenceDate = new Date()) {
  const quantidade = Number(product.quantidade_estoque || 0);
  const dias = daysUntilExpiration(product.data_validade, referenceDate);
  const derivedStatusId = calculateStatusId({ dataValidade: product.data_validade, quantidade }, referenceDate);
  const status = product.status === STATUS_NAMES[STATUS_IDS.INATIVO] ? product.status : STATUS_NAMES[derivedStatusId];

  return {
    ...product,
    data_validade: toDateString(product.data_validade),
    data_entrada: product.data_entrada ? toDateString(product.data_entrada) : product.data_entrada,
    status,
    dias_para_vencer: dias,
    proximo_do_vencimento: dias >= 0 && dias <= EXPIRING_SOON_DAYS,
    estoque_baixo: quantidade <= Number(product.quantidade_minima || 0),
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
  calculateStatusId,
  describeProduct,
};

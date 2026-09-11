const STATUS_IDS = {
  ATIVO: 1,
  INATIVO: 2,
  ESGOTADO: 3,
  VENCIDO: 4,
};

function toDateOnly(value) {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Data inválida: ${value}`);
  }

  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function isExpired(dataValidade, referenceDate = new Date()) {
  const expiration = toDateOnly(dataValidade);
  const reference = toDateOnly(referenceDate);
  return expiration.getTime() < reference.getTime();
}

function daysUntilExpiration(dataValidade, referenceDate = new Date()) {
  const expiration = toDateOnly(dataValidade);
  const reference = toDateOnly(referenceDate);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((expiration.getTime() - reference.getTime()) / msPerDay);
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

module.exports = { STATUS_IDS, toDateOnly, isExpired, daysUntilExpiration, calculateStatusId };

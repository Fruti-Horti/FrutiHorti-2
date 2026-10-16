const { isValidDateString } = require('./productStatus');

const STOCK_MOVEMENT_SUBTYPES = ['venda', 'perda', 'ajuste', 'outro'];

const REQUIRED_FIELDS_ON_CREATE = [
  'nome',
  'categoria',
  'codigo_lote',
  'data_validade',
  'preco_unitario',
  'quantidade_estoque',
];

// Lot fields are not part of an update: lots change only through stock entries.
const REQUIRED_FIELDS_ON_UPDATE = ['nome', 'categoria', 'preco_unitario'];

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function findMissingField(payload, requiredFields) {
  return requiredFields.find((field) => isBlank(payload[field]));
}

function normalizeOptionalText(value) {
  if (value === undefined) {
    return undefined;
  }

  const text = value === null ? '' : String(value).trim();
  return text || null;
}

function validateOptionalDate(payload, field) {
  if (isBlank(payload[field]) || isValidDateString(String(payload[field]).trim())) {
    return null;
  }
  return `${field} deve ser uma data válida no formato YYYY-MM-DD`;
}

// Validates lot dates when present; whether data_validade is required is up to the caller.
function validateLotDates(payload) {
  const formatError = validateOptionalDate(payload, 'data_validade') || validateOptionalDate(payload, 'data_entrada');
  if (formatError) {
    return formatError;
  }

  if (isBlank(payload.data_validade) || isBlank(payload.data_entrada)) {
    return null;
  }

  // YYYY-MM-DD strings compare chronologically.
  if (String(payload.data_validade).trim() < String(payload.data_entrada).trim()) {
    return 'data_validade não pode ser anterior à data_entrada';
  }

  return null;
}

function validateProductPayload(payload, { isUpdate = false } = {}) {
  if (!payload || typeof payload !== 'object') {
    return 'Payload é obrigatório';
  }

  const requiredFields = isUpdate ? REQUIRED_FIELDS_ON_UPDATE : REQUIRED_FIELDS_ON_CREATE;
  const missingField = findMissingField(payload, requiredFields);
  if (missingField) {
    return `Campo ${missingField} é obrigatório`;
  }

  if (!isUpdate) {
    const dateError = validateLotDates(payload);
    if (dateError) {
      return dateError;
    }
  }

  const price = Number(payload.preco_unitario);
  if (!Number.isFinite(price) || price < 0) {
    return 'preco_unitario deve ser um número não negativo';
  }

  if (!isUpdate && (!Number.isInteger(Number(payload.quantidade_estoque)) || Number(payload.quantidade_estoque) < 0)) {
    return 'quantidade_estoque deve ser um número inteiro não negativo';
  }

  if (!isBlank(payload.quantidade_minima)) {
    const minima = Number(payload.quantidade_minima);
    if (!Number.isInteger(minima) || minima < 0) {
      return 'quantidade_minima deve ser um número inteiro não negativo';
    }
  }

  return null;
}

function normalizeProductPayload(payload, { isUpdate = false } = {}) {
  const normalized = {
    nome: String(payload.nome).trim(),
    categoria: String(payload.categoria).trim(),
    preco_unitario: Number(payload.preco_unitario),
    perecivel: payload.perecivel !== false,
    // undefined means "not sent": updates keep the stored value instead of resetting it.
    quantidade_minima: isBlank(payload.quantidade_minima) ? undefined : Number(payload.quantidade_minima),
    localizacao: normalizeOptionalText(payload.localizacao),
  };

  if (!isUpdate) {
    normalized.codigo_lote = String(payload.codigo_lote).trim();
    normalized.data_validade = String(payload.data_validade).trim();
    normalized.data_entrada = normalizeOptionalText(payload.data_entrada) || undefined;
    normalized.quantidade_estoque = Number(payload.quantidade_estoque);
  }

  return normalized;
}

function validateStockMovementPayload(payload, { requireSubtipo = false } = {}) {
  if (!payload || typeof payload !== 'object') {
    return 'Payload é obrigatório';
  }

  const quantidade = Number(payload.quantidade);
  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    return 'quantidade deve ser um número inteiro maior que zero';
  }

  if (payload.subtipo !== undefined && !STOCK_MOVEMENT_SUBTYPES.includes(payload.subtipo)) {
    return `subtipo deve ser um dos seguintes valores: ${STOCK_MOVEMENT_SUBTYPES.join(', ')}`;
  }

  if (requireSubtipo && !payload.subtipo) {
    return 'subtipo é obrigatório para registrar saída de estoque';
  }

  return validateLotDates(payload);
}

// codigo_lote is optional: entries without it go to the product's latest lot, exits without it use FEFO.
function normalizeStockMovementPayload(payload) {
  return {
    quantidade: Number(payload.quantidade),
    subtipo: payload.subtipo,
    motivo: normalizeOptionalText(payload.motivo) || null,
    codigoLote: normalizeOptionalText(payload.codigo_lote) || undefined,
    dataValidade: normalizeOptionalText(payload.data_validade) || undefined,
    dataEntrada: normalizeOptionalText(payload.data_entrada) || undefined,
  };
}

module.exports = {
  STOCK_MOVEMENT_SUBTYPES,
  validateProductPayload,
  normalizeProductPayload,
  validateStockMovementPayload,
  normalizeStockMovementPayload,
};

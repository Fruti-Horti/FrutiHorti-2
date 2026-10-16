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

const REQUIRED_FIELDS_ON_UPDATE = ['nome', 'categoria', 'codigo_lote', 'data_validade', 'preco_unitario'];

function findMissingField(payload, requiredFields) {
  return requiredFields.find((field) => {
    const value = payload[field];
    return value === undefined || value === null || String(value).trim() === '';
  });
}

function validateProductDates(payload) {
  const dataValidade = String(payload.data_validade).trim();
  if (!isValidDateString(dataValidade)) {
    return 'data_validade deve ser uma data válida no formato YYYY-MM-DD';
  }

  if (!payload.data_entrada) {
    return null;
  }

  const dataEntrada = String(payload.data_entrada).trim();
  if (!isValidDateString(dataEntrada)) {
    return 'data_entrada deve ser uma data válida no formato YYYY-MM-DD';
  }

  // YYYY-MM-DD strings compare chronologically.
  if (dataValidade < dataEntrada) {
    return 'data_validade não pode ser anterior à data_entrada';
  }

  return null;
}

function normalizeOptionalText(value) {
  if (value === undefined) {
    return undefined;
  }

  const text = value === null ? '' : String(value).trim();
  return text || null;
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

  const dateError = validateProductDates(payload);
  if (dateError) {
    return dateError;
  }

  const price = Number(payload.preco_unitario);
  if (!Number.isFinite(price) || price < 0) {
    return 'preco_unitario deve ser um número não negativo';
  }

  if (!isUpdate && (!Number.isInteger(Number(payload.quantidade_estoque)) || Number(payload.quantidade_estoque) < 0)) {
    return 'quantidade_estoque deve ser um número inteiro não negativo';
  }

  if (payload.quantidade_minima !== undefined && payload.quantidade_minima !== null) {
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
    codigo_lote: String(payload.codigo_lote).trim(),
    data_validade: String(payload.data_validade).trim(),
    data_entrada: payload.data_entrada ? String(payload.data_entrada).trim() : undefined,
    preco_unitario: Number(payload.preco_unitario),
    perecivel: payload.perecivel !== false,
    // undefined means "not sent": updates keep the stored value instead of resetting it.
    quantidade_minima:
      payload.quantidade_minima !== undefined && payload.quantidade_minima !== null
        ? Number(payload.quantidade_minima)
        : undefined,
    localizacao: normalizeOptionalText(payload.localizacao),
  };

  if (!isUpdate) {
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

  return null;
}

module.exports = {
  STOCK_MOVEMENT_SUBTYPES,
  validateProductPayload,
  normalizeProductPayload,
  validateStockMovementPayload,
};

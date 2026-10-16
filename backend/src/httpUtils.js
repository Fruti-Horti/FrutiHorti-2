const { ValidationError, PayloadTooLargeError } = require('./errors');

const MAX_BODY_BYTES = 1024 * 1024;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...CORS_HEADERS,
  });
  res.end(JSON.stringify(payload));
}

function sendHtml(res, statusCode, html) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    ...CORS_HEADERS,
  });
  res.end(html);
}

function parseJsonText(rawData) {
  if (!rawData) {
    return {};
  }

  let parsed;
  try {
    parsed = JSON.parse(rawData);
  } catch {
    throw new ValidationError('Corpo da requisição não é um JSON válido');
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ValidationError('Corpo da requisição deve ser um objeto JSON');
  }

  return parsed;
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let rawData = '';
    let tooLarge = false;

    req.on('data', (chunk) => {
      if (tooLarge) return;

      rawData += chunk;
      if (Buffer.byteLength(rawData) > MAX_BODY_BYTES) {
        tooLarge = true;
        reject(new PayloadTooLargeError());
      }
    });

    req.on('end', () => {
      if (tooLarge) return;

      try {
        resolve(parseJsonText(rawData));
      } catch (error) {
        reject(error);
      }
    });

    req.on('error', () => {
      reject(new Error('Falha ao ler o corpo da requisição'));
    });
  });
}

module.exports = { CORS_HEADERS, sendJson, sendHtml, parseJsonText, parseJsonBody };

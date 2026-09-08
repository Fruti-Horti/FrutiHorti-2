const http = require('http');
const { initDatabase } = require('./database');
const { sendJson } = require('./httpUtils');
const { findRoute } = require('./router');
const { AppError } = require('./errors');

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT) || 3000;

function serveApiInfo(res) {
  sendJson(res, 200, {
    service: 'frutihorti-backend',
    message: 'API do FrutiHorti. Consulte /health para status e /products para o catálogo.',
  });
}

function handleError(res, error) {
  if (error instanceof AppError) {
    sendJson(res, error.statusCode, { error: error.message });
    return;
  }

  console.error(error);
  sendJson(res, 500, { error: 'Erro interno do servidor' });
}

async function dispatch(req, res, url) {
  const route = findRoute(req.method, url.pathname);

  if (!route) {
    sendJson(res, 404, { error: 'Rota não encontrada' });
    return;
  }

  try {
    await route.handler(req, res, route.params);
  } catch (error) {
    handleError(res, error);
  }
}

initDatabase().catch((error) => {
  console.error('Falha ao conectar ao MySQL:', error.message);
});

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (url.pathname === '/' && req.method === 'GET') {
    serveApiInfo(res);
    return;
  }

  dispatch(req, res, url);
});

server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});

module.exports = server;
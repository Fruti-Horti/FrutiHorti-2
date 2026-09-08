const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function request(path, options = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options,
    });

    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await response.json() : null;

    if (!response.ok) {
        const message = body?.error || `Erro ${response.status} ao acessar a API`;
        throw new Error(message);
    }

    return body;
}

export const apiGet = (path) => request(path);
export const apiPost = (path, payload) => request(path, { method: 'POST', body: JSON.stringify(payload) });
export const apiPut = (path, payload) => request(path, { method: 'PUT', body: JSON.stringify(payload) });
export const apiDelete = (path) => request(path, { method: 'DELETE' });
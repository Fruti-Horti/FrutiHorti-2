import { apiGet, apiPost, apiPut, apiDelete } from './apiClient';

export function mapProductFromApi(product) {
    return {
        id: product.id,
        nome: product.nome,
        categoria: product.categoria,
        codigoLote: product.codigo_lote,
        dataEntrada: product.data_entrada,
        dataValidade: product.data_validade,
        precoUnitario: Number(product.preco_unitario),
        perecivel: Boolean(product.perecivel),
        status: product.status,
        quantidadeEstoque: product.quantidade_estoque,
        quantidadeMinima: product.quantidade_minima,
        localizacao: product.localizacao,
        diasParaVencer: product.dias_para_vencer,
        estoqueBaixo: product.estoque_baixo,
        proximoDoVencimento: product.proximo_do_vencimento,
    };
}

export function listProducts() {
    return apiGet('/products').then((data) => data.items);
}

export function getStockSummary() {
    return apiGet('/stock').then((data) => data.items);
}

export function listCategories() {
    return apiGet('/categories').then((data) => data.items);
}

export function createProduct(payload) {
    return apiPost('/products', payload).then((data) => data.item);
}

export function updateProduct(id, payload) {
    return apiPut(`/products/${id}`, payload).then((data) => data.item);
}

export function deleteProduct(id) {
    return apiDelete(`/products/${id}`);
}

export function registerStockEntry(id, payload) {
    return apiPost(`/products/${id}/stock/entries`, payload).then((data) => data.item);
}

export function registerStockExit(id, payload) {
    return apiPost(`/products/${id}/stock/exits`, payload).then((data) => data.item);
}

export function listMovements(id) {
    return apiGet(`/products/${id}/movements`).then((data) => data.items);
}
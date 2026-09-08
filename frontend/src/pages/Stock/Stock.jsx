import { useEffect, useMemo, useState } from 'react';
import './Stock.css';

import { Package, Apple, Ban, Plus } from "lucide-react";

import SearchLayout from "../../layouts/SearchLayout/SearchLayout";
import Button from "../../components/Button/Button";
import InfoCard from "../../components/InfoCard/InfoCard";
import StockTable from "../../components/StockTable/StockTable.jsx";
import ProductFormModal from "../../components/ProductFormModal/ProductFormModal.jsx";

import { Text } from "../../styles/globalStyles";

import {
    getStockSummary,
    mapProductFromApi,
    createProduct,
    registerStockEntry,
    registerStockExit,
    deleteProduct,
} from "../../services/productsApi.js";

const Stock = () => {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("Todas");
    const [isModalOpen, setModalOpen] = useState(false);

    const loadStock = () => {
        return getStockSummary()
            .then((items) => {
                setProducts(items.map(mapProductFromApi));
                setError(null);
            })
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadStock();
    }, []);

    const filteredProducts = useMemo(() => {
        return products.filter((product) => {
            const matchesCategory = category === "Todas" || product.categoria === category;
            const matchesSearch = product.nome.toLowerCase().includes(search.toLowerCase());
            return matchesCategory && matchesSearch;
        });
    }, [products, category, search]);

    const totalProducts = products.length;
    const expiredCount = products.filter((product) => product.status === 'vencido').length;
    const expiringSoonCount = products.filter(
        (product) => product.status !== 'vencido' && product.proximoDoVencimento
    ).length;

    const handleCreateProduct = async (payload) => {
        await createProduct(payload);
        setModalOpen(false);
        await loadStock();
    };

    const handleEntry = async (id, payload) => {
        await registerStockEntry(id, payload);
        await loadStock();
    };

    const handleExit = async (id, payload) => {
        await registerStockExit(id, payload);
        await loadStock();
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Excluir este produto? Essa ação não pode ser desfeita.")) return;
        await deleteProduct(id);
        await loadStock();
    };

    return (
        <div className="stockApp">
            <div className="stockTitle">
                <div className="titleText">
                    <Text fontSize="2.4rem" fontFamily="Lora, serif" fontWeight="bold">
                        Gestão de estoque
                    </Text>

                    <Text fontSize="1.2rem">
                        Controle lotes, quantidades e validade dos produtos da loja.
                    </Text>
                </div>

                <Button
                    icon={<Plus size={16} />}
                    label="Novo produto"
                    onClick={() => setModalOpen(true)}
                />
            </div>

            <div className="stockCards">
                <InfoCard icon={<Package size={20} />} title="Produtos" content={totalProducts} variant="default" />
                <InfoCard icon={<Apple size={20} />} title="Próximos do vencimento" content={expiringSoonCount} variant="warning" />
                <InfoCard icon={<Ban size={20} />} title="Vencidos" content={expiredCount} variant="danger" />
            </div>

            <SearchLayout
                searchValue={search}
                onSearchChange={setSearch}
                activeCategory={category}
                onCategoryChange={setCategory}
            />

            <div className="stockTableWrapper">
                {loading && <Text fontSize="1.2rem">Carregando estoque...</Text>}

                {!loading && error && (
                    <Text fontSize="1.2rem" color="var(--solid-red)">
                        Não foi possível carregar o estoque: {error}
                    </Text>
                )}

                {!loading && !error && (
                    <StockTable
                        products={filteredProducts}
                        onEntry={handleEntry}
                        onExit={handleExit}
                        onDelete={handleDelete}
                    />
                )}
            </div>

            {isModalOpen && (
                <ProductFormModal
                    onClose={() => setModalOpen(false)}
                    onSubmit={handleCreateProduct}
                />
            )}
        </div>
    )
}

export default Stock;
import { useEffect, useMemo, useState } from 'react';
import './HomePage.css';

import TitleLayout from "../../layouts/TitleLayout/TitleLayout.jsx";
import SearchLayout from "../../layouts/SearchLayout/SearchLayout.jsx";
import FoodCard from "../../components/FoodCard/FoodCard.jsx";
import FooterLayout from '../../layouts/FooterLayout/FooterLayout.jsx';

import { Text } from "../../styles/globalStyles.js";
import { listProducts, mapProductFromApi } from "../../services/productsApi.js";

const HomePage = () => {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("Todas");

    useEffect(() => {
        let isMounted = true;

        listProducts()
            .then((items) => {
                if (isMounted) setProducts(items.map(mapProductFromApi));
            })
            .catch((err) => {
                if (isMounted) setError(err.message);
            })
            .finally(() => {
                if (isMounted) setLoading(false);
            });

        return () => { isMounted = false; };
    }, []);

    const filteredProducts = useMemo(() => {
        return products.filter((product) => {
            const matchesCategory = category === "Todas" || product.categoria === category;
            const matchesSearch = product.nome.toLowerCase().includes(search.toLowerCase());
            return matchesCategory && matchesSearch;
        });
    }, [products, category, search]);

    return (
        <div className="homepageApp">
            <TitleLayout/>
            <SearchLayout
                searchValue={search}
                onSearchChange={setSearch}
                activeCategory={category}
                onCategoryChange={setCategory}
            />

            {loading && (
                <Text className="homepageStatus" fontSize="1.2rem">Carregando produtos...</Text>
            )}

            {!loading && error && (
                <Text className="homepageStatus" fontSize="1.2rem" color="var(--solid-red)">
                    Não foi possível carregar os produtos: {error}
                </Text>
            )}

            {!loading && !error && filteredProducts.length === 0 && (
                <Text className="homepageStatus" fontSize="1.2rem">Nenhum produto encontrado.</Text>
            )}

            {!loading && !error && filteredProducts.length > 0 && (
                <div className="productGrid">
                    {filteredProducts.map((product) => (
                        <FoodCard key={product.id} {...product} />
                    ))}
                </div>
            )}

            <FooterLayout />
        </div>
    )
}

export default HomePage;
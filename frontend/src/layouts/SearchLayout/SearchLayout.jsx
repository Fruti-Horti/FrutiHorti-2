import { useState } from "react";
import './SearchLayout.css';

import SearchBar from "../../components/SearchBar/SearchBar.jsx";
import Filter from "../../components/Filter/Filter.jsx";

const DEFAULT_CATEGORIES = ["Fruta", "Legume", "Verdura", "Grão"];

const SearchLayout = ({
    searchValue,
    onSearchChange,
    activeCategory,
    onCategoryChange,
    categories = DEFAULT_CATEGORIES,
}) => {
    const [internalSearch, setInternalSearch] = useState("");
    const [internalCategory, setInternalCategory] = useState("Todas");

    const search = searchValue ?? internalSearch;
    const category = activeCategory ?? internalCategory;

    const handleSearchChange = (event) => {
        if (onSearchChange) {
            onSearchChange(event.target.value);
        } else {
            setInternalSearch(event.target.value);
        }
    };

    const handleCategoryChange = (nextCategory) => {
        if (onCategoryChange) {
            onCategoryChange(nextCategory);
        } else {
            setInternalCategory(nextCategory);
        }
    };

    return (
        <div className="searchLayoutApp">
            <div className="searchLayoutContainer">
                <SearchBar value={search} onChange={handleSearchChange} />

                <div className="searchLayoutFilters">
                    <Filter
                        label="Todas"
                        isActive={category === "Todas"}
                        onClick={() => handleCategoryChange("Todas")}
                    />

                    {categories.map((cat) => (
                        <Filter
                            key={cat}
                            label={cat}
                            isActive={category === cat}
                            onClick={() => handleCategoryChange(cat)}
                        />
                    ))}
                </div>
            </div>
        </div>
    )
}

export default SearchLayout;
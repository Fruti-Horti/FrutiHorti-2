import { useState } from 'react';
import './ProductFormModal.css';

import { X } from 'lucide-react';
import Button from '../Button/Button.jsx';

const CATEGORIES = ["Fruta", "Legume", "Verdura", "Grão"];

const INITIAL_FORM = {
    nome: '',
    categoria: CATEGORIES[0],
    codigo_lote: '',
    data_validade: '',
    data_entrada: '',
    preco_unitario: '',
    quantidade_estoque: '',
    quantidade_minima: '0',
};

const ProductFormModal = ({ onClose, onSubmit }) => {
    const [form, setForm] = useState(INITIAL_FORM);
    const [error, setError] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    const handleChange = (field) => (event) => {
        setForm((prev) => ({ ...prev, [field]: event.target.value }));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError(null);
        setSubmitting(true);

        try {
            await onSubmit({
                ...form,
                preco_unitario: Number(form.preco_unitario),
                quantidade_estoque: Number(form.quantidade_estoque),
                quantidade_minima: Number(form.quantidade_minima || 0),
                data_entrada: form.data_entrada || undefined,
            });
        } catch (err) {
            setError(err.message);
            setSubmitting(false);
        }
    };

    return (
        <div className="productFormOverlay" onClick={onClose}>
            <div className="productFormModal" onClick={(event) => event.stopPropagation()}>
                <div className="productFormHeader">
                    <h2>Novo produto</h2>
                    <button type="button" className="productFormClose" onClick={onClose} aria-label="Fechar">
                        <X size={18} />
                    </button>
                </div>

                <form className="productFormBody" onSubmit={handleSubmit}>
                    <label>
                        Nome
                        <input required value={form.nome} onChange={handleChange('nome')} />
                    </label>

                    <label>
                        Categoria
                        <select value={form.categoria} onChange={handleChange('categoria')}>
                            {CATEGORIES.map((category) => (
                                <option key={category} value={category}>{category}</option>
                            ))}
                        </select>
                    </label>

                    <label>
                        Código do lote
                        <input required value={form.codigo_lote} onChange={handleChange('codigo_lote')} />
                    </label>

                    <div className="productFormRow">
                        <label>
                            Data de validade
                            <input type="date" required value={form.data_validade} onChange={handleChange('data_validade')} />
                        </label>

                        <label>
                            Data de entrada
                            <input type="date" value={form.data_entrada} onChange={handleChange('data_entrada')} />
                        </label>
                    </div>

                    <div className="productFormRow">
                        <label>
                            Preço unitário (R$)
                            <input type="number" step="0.01" min="0" required value={form.preco_unitario} onChange={handleChange('preco_unitario')} />
                        </label>

                        <label>
                            Quantidade inicial
                            <input type="number" min="0" required value={form.quantidade_estoque} onChange={handleChange('quantidade_estoque')} />
                        </label>
                    </div>

                    <label>
                        Estoque mínimo
                        <input type="number" min="0" value={form.quantidade_minima} onChange={handleChange('quantidade_minima')} />
                    </label>

                    {error && <p className="productFormError">{error}</p>}

                    <div className="productFormFooter">
                        <Button type="submit" label={submitting ? "Salvando..." : "Salvar produto"} />
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ProductFormModal;
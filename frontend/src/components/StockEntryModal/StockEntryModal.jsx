import { useState } from 'react';
import '../ProductFormModal/ProductFormModal.css';

import { X } from 'lucide-react';
import Button from '../Button/Button.jsx';
import { formatDateOnly } from '../../utils/productStatus.js';

const INITIAL_FORM = {
    quantidade: '',
    codigo_lote: '',
    data_validade: '',
    data_entrada: '',
    motivo: '',
};

function buildEntryPayload(form) {
    return {
        quantidade: Number(form.quantidade),
        codigo_lote: form.codigo_lote.trim() || undefined,
        data_validade: form.data_validade || undefined,
        data_entrada: form.data_entrada || undefined,
        motivo: form.motivo.trim() || undefined,
    };
}

// Registers a stock entry in a specific lot. An existing lot keeps its dates;
// a new lot code needs an expiration date.
const StockEntryModal = ({ product, onClose, onSubmit }) => {
    const [form, setForm] = useState(INITIAL_FORM);
    const [error, setError] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    const existingLot = product.lotes.find((lot) => lot.codigoLote === form.codigo_lote.trim());

    const handleChange = (field) => (event) => {
        setForm((prev) => ({ ...prev, [field]: event.target.value }));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError(null);
        setSubmitting(true);

        try {
            await onSubmit(product.id, buildEntryPayload(form));
        } catch (err) {
            setError(err.message);
            setSubmitting(false);
        }
    };

    return (
        <div className="productFormOverlay" onClick={onClose}>
            <div className="productFormModal" onClick={(event) => event.stopPropagation()}>
                <div className="productFormHeader">
                    <h2>Entrada por lote · {product.nome}</h2>
                    <button type="button" className="productFormClose" onClick={onClose} aria-label="Fechar">
                        <X size={18} />
                    </button>
                </div>

                <form className="productFormBody" onSubmit={handleSubmit}>
                    <div className="productFormRow">
                        <label>
                            Quantidade
                            <input type="number" min="1" required value={form.quantidade} onChange={handleChange('quantidade')} />
                        </label>

                        <label>
                            Código do lote
                            <input
                                list={`lots-${product.id}`}
                                placeholder="Vazio: lote mais recente"
                                value={form.codigo_lote}
                                onChange={handleChange('codigo_lote')}
                            />
                            <datalist id={`lots-${product.id}`}>
                                {product.lotes.map((lot) => (
                                    <option key={lot.loteId} value={lot.codigoLote}>
                                        Validade {formatDateOnly(lot.dataValidade)}
                                    </option>
                                ))}
                            </datalist>
                        </label>
                    </div>

                    {existingLot ? (
                        <p className="productFormHint">
                            Lote existente, validade {formatDateOnly(existingLot.dataValidade)}.
                        </p>
                    ) : (
                        <div className="productFormRow">
                            <label>
                                Data de validade
                                <input
                                    type="date"
                                    required={Boolean(form.codigo_lote.trim())}
                                    value={form.data_validade}
                                    onChange={handleChange('data_validade')}
                                />
                            </label>

                            <label>
                                Data de entrada
                                <input type="date" value={form.data_entrada} onChange={handleChange('data_entrada')} />
                            </label>
                        </div>
                    )}

                    <label>
                        Motivo
                        <input value={form.motivo} onChange={handleChange('motivo')} />
                    </label>

                    {error && <p className="productFormError" role="alert">{error}</p>}

                    <div className="productFormFooter">
                        <Button type="submit" disabled={submitting} label={submitting ? "Salvando..." : "Registrar entrada"} />
                    </div>
                </form>
            </div>
        </div>
    );
};

export default StockEntryModal;

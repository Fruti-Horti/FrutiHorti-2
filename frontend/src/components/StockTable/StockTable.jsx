import { useState } from 'react';
import './StockTable.css';

import { Plus, Minus, Trash2 } from 'lucide-react';
import { getExpirationStatus } from '../../utils/productStatus.js';

const EXIT_SUBTYPES = [
    { value: 'venda', label: 'Venda' },
    { value: 'perda', label: 'Perda' },
    { value: 'ajuste', label: 'Ajuste' },
    { value: 'outro', label: 'Outro' },
];

function useRowState() {
    const [quantity, setQuantity] = useState('');
    const [subtipo, setSubtipo] = useState('venda');
    const [submitting, setSubmitting] = useState(false);

    const parsedQuantity = Number(quantity);
    const isQuantityValid = Number.isInteger(parsedQuantity) && parsedQuantity > 0;

    const runAction = async (action) => {
        if (!isQuantityValid || submitting) return;
        setSubmitting(true);
        try {
            await action(parsedQuantity);
            setQuantity('');
        } finally {
            setSubmitting(false);
        }
    };

    return { quantity, setQuantity, subtipo, setSubtipo, submitting, isQuantityValid, runAction };
}

const StockTableRow = ({ product, onEntry, onExit, onDelete }) => {
    const row = useRowState();
    const expiration = getExpirationStatus(product.dataValidade);

    return (
        <tr className={expiration.variant === 'expired' ? 'stockRowExpired' : ''}>
            <td>
                <span className="stockRowName">{product.nome}</span>
                <span className="stockRowLote">Lote {product.codigoLote}</span>
            </td>
            <td>{product.categoria}</td>
            <td>
                <span className={`stockRowExpiration ${expiration.variant}`}>{expiration.label}</span>
            </td>
            <td>{product.quantidadeEstoque}</td>
            <td>
                <div className="stockRowActions">
                    <input
                        type="number"
                        min="1"
                        className="stockRowQuantityInput"
                        placeholder="Qtd"
                        value={row.quantity}
                        onChange={(event) => row.setQuantity(event.target.value)}
                    />

                    <select
                        className="stockRowSubtypeSelect"
                        value={row.subtipo}
                        onChange={(event) => row.setSubtipo(event.target.value)}
                        title="Motivo da saída"
                    >
                        {EXIT_SUBTYPES.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>

                    <button
                        type="button"
                        className="stockRowActionButton entry"
                        disabled={!row.isQuantityValid || row.submitting}
                        onClick={() => row.runAction((qty) => onEntry(product.id, { quantidade: qty }))}
                        title="Registrar entrada"
                    >
                        <Plus size={14} />
                    </button>

                    <button
                        type="button"
                        className="stockRowActionButton exit"
                        disabled={!row.isQuantityValid || row.submitting}
                        onClick={() => row.runAction((qty) => onExit(product.id, { quantidade: qty, subtipo: row.subtipo }))}
                        title="Registrar saída"
                    >
                        <Minus size={14} />
                    </button>

                    <button
                        type="button"
                        className="stockRowActionButton delete"
                        onClick={() => onDelete(product.id)}
                        title="Excluir produto"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </td>
        </tr>
    );
};

const StockTable = ({ products, onEntry, onExit, onDelete }) => {
    if (products.length === 0) {
        return <p className="stockTableEmpty">Nenhum produto encontrado.</p>;
    }

    return (
        <table className="stockTable">
            <thead>
                <tr>
                    <th>Produto</th>
                    <th>Categoria</th>
                    <th>Validade</th>
                    <th>Estoque</th>
                    <th>Ações</th>
                </tr>
            </thead>
            <tbody>
                {products.map((product) => (
                    <StockTableRow
                        key={product.id}
                        product={product}
                        onEntry={onEntry}
                        onExit={onExit}
                        onDelete={onDelete}
                    />
                ))}
            </tbody>
        </table>
    );
};

export default StockTable;
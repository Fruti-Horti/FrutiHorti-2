// Formats a 'YYYY-MM-DD' string as DD/MM/YYYY without going through Date,
// so the browser's time zone can never shift the day.
export function formatDateOnly(dateString) {
    if (!dateString) return '';
    const [year, month, day] = String(dateString).slice(0, 10).split('-');
    return `${day}/${month}/${year}`;
}

// The API derives status, diasParaVencer and proximoDoVencimento in the store's time zone;
// this function only turns those fields into a label.
export function getExpirationStatus({ status, diasParaVencer, proximoDoVencimento, dataValidade }) {
    if (diasParaVencer < 0) {
        return { variant: "expired", label: "Vencido" };
    }

    if (diasParaVencer === 0) {
        const variant = status === 'vencido' ? "expired" : "warning";
        return { variant, label: "Vence hoje" };
    }

    if (proximoDoVencimento) {
        const label = diasParaVencer === 1 ? "Vence amanhã" : `Vence em ${diasParaVencer} dias`;
        return { variant: "warning", label };
    }

    return { variant: "valid", label: `Válido até ${formatDateOnly(dataValidade)}` };
}

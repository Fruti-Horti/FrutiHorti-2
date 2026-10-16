import './FoodCard.css';

import { Text } from '../../styles/globalStyles.js';
import { getExpirationStatus } from "../../utils/productStatus.js";
import { Leaf, Carrot, Sprout, Wheat, CircleCheck, TriangleAlert, CircleX } from "lucide-react";

const CATEGORY_ICONS = {
    Fruta: Leaf,
    Legume: Carrot,
    Verdura: Sprout,
    Grão: Wheat,
};

const EXPIRATION_ICONS = {
    valid: CircleCheck,
    warning: TriangleAlert,
    expired: CircleX,
};

const FoodCard = ({ nome, categoria, quantidadeEstoque, dataValidade, status, diasParaVencer, proximoDoVencimento }) => {
    const { label: expirationLabel, variant: expirationVariant } = getExpirationStatus({
        status,
        diasParaVencer,
        proximoDoVencimento,
        dataValidade,
    });
    const isExpired = status === "vencido";
    const isAvailable = !isExpired && quantidadeEstoque > 0;

    const CategoryIcon = CATEGORY_ICONS[categoria] ?? Sprout;
    const ExpirationIcon = EXPIRATION_ICONS[expirationVariant];

    return (
        <div className={`foodCard ${isExpired ? "expired" : ""}`}>
            <div className="foodCardHeader">
                <div className="foodCardIcon">
                    <CategoryIcon size={16} />
                </div>
                <Text className="foodCardCategory" fontSize="1rem" fontWeight="600">
                    {categoria}
                </Text>
            </div>

            <Text 
                className={`foodCardName ${isAvailable ? "available" : "unavailable"}`}
                fontSize="1.7rem"
                fontWeight="700"
                fontFamily="Lora, serif"
            >
                {nome}
            </Text>

            <Text 
                className={`foodCardExpiration ${expirationVariant}`}
                fontSize="1rem"
                fontWeight="600"
            >
                <ExpirationIcon size={12} />
                {expirationLabel}
            </Text>

            <div className="foodCardDivider" />

            <div className="foodCardFooter">
                <Text 
                    className={`foodCardStock ${isAvailable ? "available" : "unavailable"}`}
                    fontSize="1.2rem"
                    fontWeight="400"
                >
                    {quantidadeEstoque > 0 ? `${quantidadeEstoque} em estoque` : "Sem estoque disponível"}
                </Text>

                <Text
                    className={`foodCardAvailability ${isAvailable ? "available" : "unavailable"}`}
                    fontSize="1rem"
                    fontWeight="600"
                >
                    {isAvailable ? "Disponível" : "Indisponível"}
                </Text>
            </div>
        </div>
    )
}

export default FoodCard;
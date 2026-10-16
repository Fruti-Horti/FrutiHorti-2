const { BusinessRuleError, ValidationError } = require('./errors');
const { isExpired } = require('./productStatus');

// Critical business rule: an expired product can never be sold. Other exits (loss, adjustment)
// stay allowed so expired stock can be written off.
function assertStockExitAllowed({ subtipo, dataValidade, currentQuantity, quantidade }, referenceDate = new Date()) {
  if (subtipo === 'venda' && isExpired(dataValidade, referenceDate)) {
    throw new BusinessRuleError('Não é permitido registrar venda de produto vencido');
  }

  if (quantidade > currentQuantity) {
    throw new ValidationError('Quantidade em estoque insuficiente para essa saída');
  }
}

module.exports = { assertStockExitAllowed };

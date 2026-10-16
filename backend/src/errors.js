class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
  }
}

class ValidationError extends AppError {
  constructor(message) {
    super(message, 400);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Recurso não encontrado') {
    super(message, 404);
  }
}

class BusinessRuleError extends AppError {
  constructor(message) {
    super(message, 422);
  }
}

class ConflictError extends AppError {
  constructor(message) {
    super(message, 409);
  }
}

class PayloadTooLargeError extends AppError {
  constructor(message = 'Corpo da requisição excede o tamanho máximo permitido') {
    super(message, 413);
  }
}

module.exports = { AppError, ValidationError, NotFoundError, BusinessRuleError, ConflictError, PayloadTooLargeError };

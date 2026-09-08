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

module.exports = { AppError, ValidationError, NotFoundError, BusinessRuleError };

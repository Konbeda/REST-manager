// Erro que o próprio código levanta de propósito, já sabendo qual
// status HTTP ele deve virar. Distingue "erro esperado" de bug.
class AppError extends Error {
  constructor(message, statusCode = 400, retryAfterSegundos) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;

    // Vira o cabeçalho Retry-After nas respostas 429.
    if (retryAfterSegundos !== undefined) {
      this.retryAfter = retryAfterSegundos;
    }

    // Remove o construtor do stack trace: aponta para quem lançou.
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = { AppError };

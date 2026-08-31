const { AppError } = require('../utils/AppError');

// Os 4 parâmetros são obrigatórios: é assim que o Express reconhece
// uma função como middleware de ERRO, e não como middleware comum.
function errorHandler(err, req, res, next) {
  // Erro que o nosso código levantou de propósito, já com status.
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  // Erro de validação do Mongoose -> 400 com os campos que falharam.
  if (err.name === 'ValidationError') {
    const campos = Object.fromEntries(
      Object.entries(err.errors).map(([campo, e]) => [campo, e.message]),
    );

    return res.status(400).json({ error: 'Dados inválidos', campos });
  }

  console.error(err);

  return res.status(500).json({ error: 'Erro interno' });
}

module.exports = { errorHandler };

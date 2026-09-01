const { AppError } = require('../utils/AppError');

// Os 4 parâmetros são obrigatórios: é assim que o Express reconhece
// uma função como middleware de ERRO, e não como middleware comum.
function errorHandler(err, req, res, next) {
  // Erro que o nosso código levantou de propósito, já com status.
  if (err instanceof AppError) {
    // Cabeçalho padrão do HTTP: diz ao cliente quando vale a pena tentar de novo.
    if (err.retryAfter !== undefined) {
      res.set('Retry-After', String(err.retryAfter));
    }

    return res.status(err.statusCode).json({ error: err.message });
  }

  // Índice único violado -> 409. Vem do banco, não de uma checagem prévia,
  // então não há janela de corrida entre "consultei" e "gravei".
  if (err.code === 11000) {
    const campo = Object.keys(err.keyValue ?? {})[0] ?? 'campo';

    return res.status(409).json({ error: `Já existe um registro com esse ${campo}` });
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

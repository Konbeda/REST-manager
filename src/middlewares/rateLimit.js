const rateLimit = require('express-rate-limit');

const { AppError } = require('../utils/AppError');

const JANELA_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000);
const MAX_POR_IP = Number(process.env.RATE_LIMIT_AUTH_MAX ?? 30);

// Limite por IP nas rotas de autenticação.
//
// Contador em MEMÓRIA: correto com uma instância, e insuficiente com várias
// atrás de um balanceador, onde o limite efetivo multiplica pelo número de
// instâncias. A correção é um store compartilhado (Redis) — ver README.
const authRateLimit = rateLimit({
  windowMs: JANELA_MS,
  limit: MAX_POR_IP,

  // Cabeçalhos RateLimit-* padronizados; os X-RateLimit-* antigos ficam de fora.
  standardHeaders: 'draft-7',
  legacyHeaders: false,

  // Delega ao errorHandler em vez de responder aqui, para o formato do erro
  // ser o mesmo do resto da API.
  handler: (req, res, next) => {
    const segundos = Math.ceil(JANELA_MS / 1000);

    next(
      new AppError(
        'Muitas requisições deste IP. Tente novamente mais tarde.',
        429,
        segundos,
      ),
    );
  },
});

module.exports = { authRateLimit, JANELA_MS, MAX_POR_IP };

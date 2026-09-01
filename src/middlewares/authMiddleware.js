const jwt = require('jsonwebtoken');

const { AppError } = require('../utils/AppError');

// Middleware síncrono: um throw aqui é capturado pelo Express
// e encaminhado ao errorHandler, igual às promises rejeitadas.
function requireAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    throw new AppError('Token não fornecido', 401);
  }

  const token = header.slice('Bearer '.length).trim();

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    req.userId = payload.id;
    next();
  } catch (err) {
    // Distinguir expirado de inválido ajuda o cliente a decidir entre
    // renovar a sessão e mandar o usuário fazer login de novo.
    if (err.name === 'TokenExpiredError') {
      throw new AppError('Token expirado', 401);
    }

    throw new AppError('Token inválido', 401);
  }
}

module.exports = { requireAuth };

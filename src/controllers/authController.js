const authService = require('../services/authService');

async function register(req, res) {
  const user = await authService.register(req.body);

  res.status(201).json(user);
}

async function login(req, res) {
  const resultado = await authService.login(req.body);

  res.json(resultado);
}

module.exports = { register, login };

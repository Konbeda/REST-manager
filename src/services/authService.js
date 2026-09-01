const jwt = require('jsonwebtoken');

const { User } = require('../models/User');
const { AppError } = require('../utils/AppError');

const CAMPOS_REGISTRO = ['name', 'email', 'password'];

const EXPIRACAO_TOKEN = '1d';

function filtrarCampos(dados, permitidos) {
  const limpo = {};
  for (const campo of permitidos) {
    if (dados[campo] !== undefined) limpo[campo] = dados[campo];
  }
  return limpo;
}

function gerarToken(user) {
  const segredo = process.env.JWT_SECRET;

  // Falha alta e cedo: sem segredo, assinar produziria token inseguro.
  if (!segredo) {
    throw new Error('JWT_SECRET não definida. Veja o .env.example.');
  }

  return jwt.sign({ id: user._id.toString() }, segredo, {
    expiresIn: EXPIRACAO_TOKEN,
  });
}

async function register(dados) {
  const campos = filtrarCampos(dados, CAMPOS_REGISTRO);

  // O hash da senha acontece no pre('save') do schema — por isso create(),
  // e nunca findOneAndUpdate, que não dispara hooks de documento.
  const user = await User.create(campos);

  // create() devolve o documento com a senha em memória, apesar do
  // select: false. Removemos antes de qualquer coisa sair daqui.
  user.password = undefined;

  return user;
}

async function login({ email, password } = {}) {
  if (!email || !password) {
    throw new AppError('Informe e-mail e senha', 400);
  }

  // A senha é select: false no schema; aqui ela é pedida explicitamente.
  const user = await User.findOne({ email: String(email).toLowerCase() }).select(
    '+password',
  );

  // Mesma mensagem para "não existe" e "senha errada": diferenciar
  // transformaria o login num verificador de quem tem conta.
  const credenciaisInvalidas = new AppError('Credenciais inválidas', 401);

  if (!user) throw credenciaisInvalidas;

  const senhaConfere = await user.checkPassword(password);
  if (!senhaConfere) throw credenciaisInvalidas;

  return { token: gerarToken(user) };
}

module.exports = { register, login };

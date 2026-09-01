const jwt = require('jsonwebtoken');

const { User } = require('../models/User');
const { LoginAttempt } = require('../models/LoginAttempt');
const { AppError } = require('../utils/AppError');

const CAMPOS_REGISTRO = ['name', 'email', 'password'];

const EXPIRACAO_TOKEN = '1d';

// Limite POR CONTA, independente do IP: um ataque distribuído por centenas
// de máquinas escapa do limite por IP, mas não deste.
const MAX_FALHAS_POR_CONTA = Number(process.env.LOGIN_MAX_FALHAS ?? 5);
const JANELA_FALHAS_MS = Number(process.env.LOGIN_JANELA_MS ?? 15 * 60 * 1000);

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

async function tentativasDaConta(email) {
  const registro = await LoginAttempt.findOne({ email });

  return registro?.count ?? 0;
}

async function registrarFalha(email) {
  const atualizacao = {
    $inc: { count: 1 },
    // Só na criação: a janela conta a partir da PRIMEIRA falha e não é
    // renovada pelas seguintes. Caso contrário o atacante manteria a conta
    // bloqueada para sempre, só continuando a tentar.
    $setOnInsert: { expiresAt: new Date(Date.now() + JANELA_FALHAS_MS) },
  };

  try {
    await LoginAttempt.updateOne({ email }, atualizacao, { upsert: true });
  } catch (err) {
    // Duas falhas simultâneas para o mesmo e-mail podem tentar inserir ao
    // mesmo tempo; o índice único recusa a segunda. Basta repetir, porque
    // agora o documento existe e o $inc encontra o alvo.
    if (err.code !== 11000) throw err;
    await LoginAttempt.updateOne({ email }, { $inc: { count: 1 } });
  }
}

async function limparTentativas(email) {
  await LoginAttempt.deleteOne({ email });
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

  const chave = String(email).toLowerCase();

  // Antes de qualquer trabalho caro: a conta está trancada nesta janela?
  if ((await tentativasDaConta(chave)) >= MAX_FALHAS_POR_CONTA) {
    throw new AppError(
      'Muitas tentativas para esta conta. Tente novamente mais tarde.',
      429,
      Math.ceil(JANELA_FALHAS_MS / 1000),
    );
  }

  // A senha é select: false no schema; aqui ela é pedida explicitamente.
  const user = await User.findOne({ email: chave }).select('+password');

  // Mesma mensagem para "não existe" e "senha errada": diferenciar
  // transformaria o login num verificador de quem tem conta.
  const credenciaisInvalidas = new AppError('Credenciais inválidas', 401);

  if (!user) {
    // Conta o erro mesmo para e-mail inexistente: se só contasse para contas
    // reais, a diferença de comportamento revelaria quais existem.
    await registrarFalha(chave);
    throw credenciaisInvalidas;
  }

  const senhaConfere = await user.checkPassword(password);

  if (!senhaConfere) {
    await registrarFalha(chave);
    throw credenciaisInvalidas;
  }

  // Login bem-sucedido zera o contador.
  await limparTentativas(chave);

  return { token: gerarToken(user) };
}

module.exports = { register, login, MAX_FALHAS_POR_CONTA, JANELA_FALHAS_MS };

// Precisa vir antes do require do app: o service lê o ambiente ao carregar.
process.env.LOGIN_MAX_FALHAS = '3';
process.env.LOGIN_JANELA_MS = String(15 * 60 * 1000);
process.env.RATE_LIMIT_AUTH_MAX = '1000000'; // o limite por IP não interfere aqui

const request = require('supertest');
const mongoose = require('mongoose');

const app = require('../src/app');
const { User } = require('../src/models/User');
const { LoginAttempt } = require('../src/models/LoginAttempt');
const { conectarMongo } = require('./helpers');


beforeAll(async () => {
  await conectarMongo();
  await LoginAttempt.init();
});

afterEach(async () => {
  await User.deleteMany({});
  await LoginAttempt.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
});

const USUARIO = { name: 'Victor', email: 'victor@exemplo.com', password: 'senha-secreta' };

const registrar = () => request(app).post('/api/auth/register').send(USUARIO);
const logar = (password, email = USUARIO.email) =>
  request(app).post('/api/auth/login').send({ email, password });

describe('Bloqueio por conta após falhas seguidas', () => {
  beforeEach(registrar);

  it('bloqueia a 4ª tentativa com 429 e Retry-After', async () => {
    for (let i = 1; i <= 3; i++) {
      expect((await logar('errada')).status).toBe(401);
    }

    const bloqueada = await logar('errada');

    expect(bloqueada.status).toBe(429);
    expect(bloqueada.body.error).toMatch(/Muitas tentativas para esta conta/);
    expect(Number(bloqueada.headers['retry-after'])).toBe(15 * 60);
  });

  it('bloqueia mesmo com a senha CERTA — o limite é da conta', async () => {
    for (let i = 1; i <= 3; i++) await logar('errada');

    const comSenhaCerta = await logar(USUARIO.password);

    expect(comSenhaCerta.status).toBe(429);
  });

  it('um login bem-sucedido zera o contador', async () => {
    await logar('errada');
    await logar('errada');

    expect((await logar(USUARIO.password)).status).toBe(200);
    expect(await LoginAttempt.countDocuments({ email: USUARIO.email })).toBe(0);

    // Volta a ter as 3 tentativas inteiras.
    for (let i = 1; i <= 3; i++) {
      expect((await logar('errada')).status).toBe(401);
    }
  });

  it('o bloqueio de uma conta não afeta outra', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ ...USUARIO, email: 'outra@exemplo.com' });

    for (let i = 1; i <= 3; i++) await logar('errada');

    expect((await logar('errada')).status).toBe(429);
    expect((await logar(USUARIO.password, 'outra@exemplo.com')).status).toBe(200);
  });

  it('conta falhas também para e-mail inexistente', async () => {
    // Se só contasse para contas reais, a diferença de comportamento
    // revelaria quais e-mails existem no sistema.
    for (let i = 1; i <= 3; i++) {
      expect((await logar('x', 'ninguem@exemplo.com')).status).toBe(401);
    }

    expect((await logar('x', 'ninguem@exemplo.com')).status).toBe(429);
  });

  it('a janela é contada a partir da PRIMEIRA falha e não é renovada', async () => {
    await logar('errada');
    const primeiro = await LoginAttempt.findOne({ email: USUARIO.email });

    await logar('errada');
    const segundo = await LoginAttempt.findOne({ email: USUARIO.email });

    // Se cada falha renovasse a janela, um atacante manteria a conta
    // trancada indefinidamente só continuando a tentar.
    expect(segundo.expiresAt.getTime()).toBe(primeiro.expiresAt.getTime());
    expect(segundo.count).toBe(2);
  });

  it('existe índice TTL absoluto sobre expiresAt', async () => {
    const indices = await LoginAttempt.collection.indexes();
    const ttl = indices.find(
      (i) => Object.keys(i.key).length === 1 && i.key.expiresAt === 1,
    );

    expect(ttl).toBeDefined();
    expect(ttl.expireAfterSeconds).toBe(0); // expira NA data do campo
  });
});

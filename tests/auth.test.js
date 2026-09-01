const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// O teste controla o próprio ambiente: não depende do .env da máquina.
process.env.JWT_SECRET = 'segredo-de-teste-nao-usar-em-producao';

const app = require('../src/app');
const { User } = require('../src/models/User');
const { conectarMongo } = require('./helpers');


beforeAll(async () => {
  await conectarMongo();

  // Cria os índices declarados no schema — sem isto o unique não existe.
  await User.init();
});

afterEach(async () => {
  await User.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
});

const USUARIO = {
  name: 'Victor',
  email: 'victor@exemplo.com',
  password: 'senha-secreta',
};

const registrar = (dados = USUARIO) =>
  request(app).post('/api/auth/register').send(dados);

describe('POST /api/auth/register', () => {
  it('cria o usuário e responde 201', async () => {
    const res = await registrar();

    expect(res.status).toBe(201);
    expect(res.body._id).toBeDefined();
    expect(res.body.name).toBe('Victor');
  });

  it('nunca devolve a senha na resposta', async () => {
    const res = await registrar();

    expect(res.body.password).toBeUndefined();
  });

  it('guarda o hash, nunca a senha em texto puro', async () => {
    await registrar();

    const user = await User.findOne({ email: USUARIO.email }).select('+password');

    expect(user.password).not.toBe(USUARIO.password);
    expect(user.password).toMatch(/^\$2[aby]\$\d{2}\$/); // formato do bcrypt
  });

  it('normaliza o e-mail para minúsculas', async () => {
    await registrar({ ...USUARIO, email: 'VICTOR@Exemplo.COM' });

    const user = await User.findOne({ email: 'victor@exemplo.com' });

    expect(user).not.toBeNull();
  });

  it('recusa e-mail repetido com 409', async () => {
    await registrar();

    const res = await registrar();

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/email/i);
  });

  it('trata maiúsculas como o mesmo e-mail na duplicidade', async () => {
    await registrar();

    const res = await registrar({ ...USUARIO, email: 'VICTOR@EXEMPLO.COM' });

    expect(res.status).toBe(409);
  });

  it('recusa e-mail em formato inválido', async () => {
    const res = await registrar({ ...USUARIO, email: 'nao-e-email' });

    expect(res.status).toBe(400);
    expect(res.body.campos.email).toBe('E-mail inválido');
  });

  it('recusa senha curta demais', async () => {
    const res = await registrar({ ...USUARIO, password: '123' });

    expect(res.status).toBe(400);
    expect(res.body.campos.password).toBeDefined();
  });

  it('recusa corpo sem os campos obrigatórios', async () => {
    const res = await registrar({});

    expect(res.status).toBe(400);
    expect(res.body.campos.name).toBeDefined();
    expect(res.body.campos.email).toBeDefined();
    expect(res.body.campos.password).toBeDefined();
  });

  it('ignora campos que o cliente não deveria definir', async () => {
    const res = await registrar({ ...USUARIO, _id: 'forjado', role: 'admin' });

    expect(res.status).toBe(201);
    expect(res.body._id).not.toBe('forjado');
    expect(res.body.role).toBeUndefined();
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await registrar();
  });

  const logar = (dados) => request(app).post('/api/auth/login').send(dados);

  it('devolve um token com as credenciais certas', async () => {
    const res = await logar({ email: USUARIO.email, password: USUARIO.password });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
  });

  it('o token carrega o id do usuário e uma expiração', async () => {
    const res = await logar({ email: USUARIO.email, password: USUARIO.password });

    const payload = jwt.verify(res.body.token, process.env.JWT_SECRET);
    const user = await User.findOne({ email: USUARIO.email });

    expect(payload.id).toBe(user._id.toString());
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });

  it('o token não é aceito com outro segredo', async () => {
    const res = await logar({ email: USUARIO.email, password: USUARIO.password });

    expect(() => jwt.verify(res.body.token, 'outro-segredo')).toThrow();
  });

  it('aceita e-mail em maiúsculas', async () => {
    const res = await logar({ email: 'VICTOR@EXEMPLO.COM', password: USUARIO.password });

    expect(res.status).toBe(200);
  });

  it('recusa senha errada com 401', async () => {
    const res = await logar({ email: USUARIO.email, password: 'errada' });

    expect(res.status).toBe(401);
  });

  it('usa a MESMA mensagem para e-mail inexistente e senha errada', async () => {
    const senhaErrada = await logar({ email: USUARIO.email, password: 'errada' });
    const emailInexistente = await logar({ email: 'ninguem@exemplo.com', password: 'x' });

    expect(emailInexistente.status).toBe(senhaErrada.status);
    expect(emailInexistente.body).toEqual(senhaErrada.body);
  });

  it('recusa corpo incompleto com 400', async () => {
    const res = await logar({ email: USUARIO.email });

    expect(res.status).toBe(400);
  });
});

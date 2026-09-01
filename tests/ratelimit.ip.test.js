// Precisa vir antes do require do app: o limitador lê o ambiente ao carregar.
process.env.RATE_LIMIT_AUTH_MAX = '5';
process.env.RATE_LIMIT_WINDOW_MS = String(15 * 60 * 1000);

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoDBContainer } = require('@testcontainers/mongodb');

const app = require('../src/app');
const { LoginAttempt } = require('../src/models/LoginAttempt');

let container;

beforeAll(async () => {
  container = await new MongoDBContainer('mongo:7').start();
  await mongoose.connect(container.getConnectionString(), { directConnection: true });
});

afterAll(async () => {
  await mongoose.disconnect();
  await container.stop();
});

const tentarLogin = (extras = {}) => {
  const req = request(app)
    .post('/api/auth/login')
    .send({ email: 'qualquer@exemplo.com', password: 'errada' });

  return extras.forwardedFor ? req.set('X-Forwarded-For', extras.forwardedFor) : req;
};

// Os testes deste bloco compartilham o contador em memória de propósito:
// cada um continua de onde o anterior parou.
describe('Rate limit por IP nas rotas de autenticação', () => {
  it('deixa passar as 5 primeiras tentativas', async () => {
    for (let i = 1; i <= 5; i++) {
      const res = await tentarLogin();
      expect(res.status).not.toBe(429);
    }
  });

  it('bloqueia a 6ª com 429 e informa Retry-After', async () => {
    const res = await tentarLogin();

    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/Muitas requisições/);
    expect(Number(res.headers['retry-after'])).toBe(15 * 60);
  });

  it('X-Forwarded-For forjado NÃO contorna o limite', async () => {
    // Com trust proxy = 0 (padrão), o Express ignora esse cabeçalho.
    // Se ele fosse confiado sem proxy real, bastaria variar o IP a cada
    // requisição para tornar o rate limit inútil.
    for (const ip of ['1.2.3.4', '5.6.7.8', '9.10.11.12']) {
      const res = await tentarLogin({ forwardedFor: ip });
      expect(res.status).toBe(429);
    }
  });

  it('expõe os cabeçalhos RateLimit padronizados', async () => {
    const res = await tentarLogin();

    expect(res.headers['ratelimit-limit'] ?? res.headers.ratelimit).toBeDefined();
  });

  it('as tentativas bloqueadas nem chegam ao banco', async () => {
    // O middleware corta antes da rota, então nenhuma tentativa nova é
    // registrada depois que o IP foi bloqueado.
    const antes = await LoginAttempt.countDocuments();
    await tentarLogin();
    expect(await LoginAttempt.countDocuments()).toBe(antes);
  });
});

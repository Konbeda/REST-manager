const request = require('supertest');
const mongoose = require('mongoose');

const app = require('../src/app');
const { conectarMongo } = require('./helpers');

beforeAll(async () => {
  await conectarMongo();
});

afterEach(() => {
  // Não deixa o estado de encerramento vazar para o próximo teste.
  delete app.locals.encerrando;
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('GET /health — liveness', () => {
  it('responde 200 com uptime', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptime).toBe('number');
  });

  it('continua 200 durante o encerramento', async () => {
    app.locals.encerrando = true;

    // Liveness responde "o processo está vivo", não "posso atender".
    // Falhar aqui faria o orquestrador REINICIAR uma instância que está
    // justamente tentando encerrar direito.
    expect((await request(app).get('/health')).status).toBe(200);
  });

  it('não exige autenticação', async () => {
    expect((await request(app).get('/health')).status).not.toBe(401);
  });
});

describe('GET /ready — readiness', () => {
  it('responde 200 quando o banco está conectado', async () => {
    const res = await request(app).get('/ready');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
  });

  it('responde 503 durante o encerramento', async () => {
    app.locals.encerrando = true;

    const res = await request(app).get('/ready');

    expect(res.status).toBe(503);
    expect(res.body.encerrando).toBe(true);
  });

  it('responde 503 quando o banco cai', async () => {
    await mongoose.disconnect();

    const res = await request(app).get('/ready');

    expect(res.status).toBe(503);
    expect(res.body.banco).toBe('desconectado');

    await conectarMongo(); // devolve o estado para os outros testes
  });

  it('difere de /health: um cai, o outro não', async () => {
    await mongoose.disconnect();

    // Banco fora: a instância está VIVA mas não está PRONTA.
    // O balanceador deve tirá-la do pool; o orquestrador não deve reiniciá-la.
    expect((await request(app).get('/health')).status).toBe(200);
    expect((await request(app).get('/ready')).status).toBe(503);

    await conectarMongo();
  });
});

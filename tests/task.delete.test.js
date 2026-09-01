const request = require('supertest');
const mongoose = require('mongoose');
const { MongoDBContainer } = require('@testcontainers/mongodb');

const app = require('../src/app');
const { Task } = require('../src/models/Task');

let container;

beforeAll(async () => {
  container = await new MongoDBContainer('mongo:7').start();
  await mongoose.connect(container.getConnectionString(), { directConnection: true });

  // Garante que os índices declarados no schema existam no banco.
  await Task.init();
});

afterEach(async () => {
  await Task.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await container.stop();
});

describe('DELETE /api/tasks/:id', () => {
  it('responde 204 sem corpo', async () => {
    const task = await Task.create({ title: 'Para apagar' });

    const res = await request(app).delete(`/api/tasks/${task._id}`);

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
    expect(res.text).toBe('');
  });

  it('marca deletedAt em vez de remover o documento', async () => {
    const task = await Task.create({ title: 'Para apagar' });

    await request(app).delete(`/api/tasks/${task._id}`);

    // Busca sem filtro: o documento continua lá.
    const bruto = await Task.findOne({ _id: task._id });
    expect(bruto).not.toBeNull();
    expect(bruto.deletedAt).toBeInstanceOf(Date);
  });

  it('é idempotente: apagar duas vezes dá 204 nas duas', async () => {
    const task = await Task.create({ title: 'Para apagar' });

    const primeira = await request(app).delete(`/api/tasks/${task._id}`);
    const segunda = await request(app).delete(`/api/tasks/${task._id}`);

    expect(primeira.status).toBe(204);
    expect(segunda.status).toBe(204);
  });

  it('responde 204 para id que nunca existiu', async () => {
    const res = await request(app).delete(`/api/tasks/${new mongoose.Types.ObjectId()}`);

    expect(res.status).toBe(204);
  });

  it('não sobrescreve o deletedAt original ao repetir', async () => {
    const task = await Task.create({ title: 'Para apagar' });

    await request(app).delete(`/api/tasks/${task._id}`);
    const primeiro = (await Task.findOne({ _id: task._id })).deletedAt;

    await request(app).delete(`/api/tasks/${task._id}`);
    const segundo = (await Task.findOne({ _id: task._id })).deletedAt;

    expect(segundo.getTime()).toBe(primeiro.getTime());
  });

  it('ainda recusa id malformado com 400', async () => {
    const res = await request(app).delete('/api/tasks/banana');

    expect(res.status).toBe(400);
  });
});

describe('Task apagada some das outras rotas', () => {
  let apagada;

  beforeEach(async () => {
    apagada = await Task.create({ title: 'Já apagada' });
    await Task.create({ title: 'Ainda viva' });
    await request(app).delete(`/api/tasks/${apagada._id}`);
  });

  it('não aparece na listagem', async () => {
    const res = await request(app).get('/api/tasks');

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Ainda viva');
  });

  it('não entra na contagem total', async () => {
    const res = await request(app).get('/api/tasks');

    expect(res.body.pagination.total).toBe(1);
  });

  it('devolve 404 na busca por id', async () => {
    const res = await request(app).get(`/api/tasks/${apagada._id}`);

    expect(res.status).toBe(404);
  });

  it('devolve 404 no PATCH', async () => {
    const res = await request(app)
      .patch(`/api/tasks/${apagada._id}`)
      .send({ status: 'done' });

    expect(res.status).toBe(404);
  });
});

describe('TTL da lixeira', () => {
  it('existe um índice TTL sobre deletedAt', async () => {
    const indices = await Task.collection.indexes();
    const ttl = indices.find((i) => i.key.deletedAt !== undefined);

    expect(ttl).toBeDefined();
    expect(ttl.expireAfterSeconds).toBe(30 * 24 * 60 * 60);
  });
});

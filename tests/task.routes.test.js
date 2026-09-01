const request = require('supertest');
const mongoose = require('mongoose');
const { MongoDBContainer } = require('@testcontainers/mongodb');

const app = require('../src/app');
const { Task } = require('../src/models/Task');

let container;

beforeAll(async () => {
  container = await new MongoDBContainer('mongo:7').start();
  await mongoose.connect(container.getConnectionString(), { directConnection: true });
});

afterEach(async () => {
  await Task.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await container.stop();
});

describe('POST /api/tasks', () => {
  it('cria uma task e responde 201', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Escrever o primeiro endpoint' });

    expect(res.status).toBe(201);
    expect(res.body._id).toBeDefined();
    expect(res.body.title).toBe('Escrever o primeiro endpoint');
    expect(res.body.status).toBe('pending');
  });

  it('grava de verdade no banco', async () => {
    await request(app).post('/api/tasks').send({ title: 'Confirmar persistência' });

    expect(await Task.countDocuments()).toBe(1);
  });

  it('responde 400 quando falta o título', async () => {
    const res = await request(app).post('/api/tasks').send({});

    expect(res.status).toBe(400);
    expect(res.body.campos.title).toBe('O título é obrigatório');
  });

  it('responde 400 para status fora do enum', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Task válida', status: 'pendente' });

    expect(res.status).toBe(400);
    expect(res.body.campos.status).toBeDefined();
  });

  it('ignora campos que o cliente não deveria definir', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Tentativa de mass assignment', _id: 'forjado', admin: true });

    expect(res.status).toBe(201);
    expect(res.body._id).not.toBe('forjado');
    expect(res.body.admin).toBeUndefined();
  });
});

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

describe('GET /tasks/:id', () => {
  it('devolve a task quando o id existe', async () => {
    const criada = await Task.create({ title: 'Buscar por id' });

    const res = await request(app).get(`/tasks/${criada._id}`);

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Buscar por id');
    expect(res.body._id).toBe(criada._id.toString());
  });

  it('devolve 404 para id válido que não existe', async () => {
    const idInexistente = new mongoose.Types.ObjectId();

    const res = await request(app).get(`/tasks/${idInexistente}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Task não encontrada');
  });

  it('devolve 400 para id malformado', async () => {
    const res = await request(app).get('/tasks/banana');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/não é um id válido/);
  });

  // Drivers antigos aceitavam qualquer string de 12 caracteres como ObjectId.
  // O bson 6 não aceita mais — o teste fica como guarda contra regressão.
  it('devolve 400 para string de 12 caracteres', async () => {
    const res = await request(app).get('/tasks/banana123456');

    expect(res.status).toBe(400);
  });

  it('aceita id em maiúsculas', async () => {
    const criada = await Task.create({ title: 'Hex maiúsculo' });

    const res = await request(app).get(`/tasks/${criada._id.toString().toUpperCase()}`);

    expect(res.status).toBe(200);
  });
});

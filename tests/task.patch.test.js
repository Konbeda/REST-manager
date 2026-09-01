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

const criarTask = () =>
  Task.create({
    title: 'Task original',
    description: 'Descrição original',
    status: 'pending',
  });

describe('PATCH /api/tasks/:id — atualização parcial', () => {
  it('altera só o campo enviado e preserva o resto', async () => {
    const task = await criarTask();

    const res = await request(app)
      .patch(`/api/tasks/${task._id}`)
      .send({ status: 'done' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
    expect(res.body.title).toBe('Task original');
    expect(res.body.description).toBe('Descrição original');
  });

  it('devolve o documento DEPOIS da alteração', async () => {
    const task = await criarTask();

    const res = await request(app)
      .patch(`/api/tasks/${task._id}`)
      .send({ title: 'Título novo' });

    // Sem { new: true } isto seria 'Task original'.
    expect(res.body.title).toBe('Título novo');
  });

  it('persiste de verdade', async () => {
    const task = await criarTask();

    await request(app).patch(`/api/tasks/${task._id}`).send({ status: 'in_progress' });

    const noBanco = await Task.findById(task._id);
    expect(noBanco.status).toBe('in_progress');
  });

  it('atualiza o updatedAt', async () => {
    const task = await criarTask();
    const antes = task.updatedAt;

    const res = await request(app)
      .patch(`/api/tasks/${task._id}`)
      .send({ status: 'done' });

    expect(new Date(res.body.updatedAt).getTime()).toBeGreaterThanOrEqual(antes.getTime());
  });
});

describe('PATCH /api/tasks/:id — validação', () => {
  it('recusa status fora do enum', async () => {
    const task = await criarTask();

    const res = await request(app)
      .patch(`/api/tasks/${task._id}`)
      .send({ status: 'pendente' });

    // Sem { runValidators: true } isto seria 200 e gravaria lixo.
    expect(res.status).toBe(400);

    const noBanco = await Task.findById(task._id);
    expect(noBanco.status).toBe('pending');
  });

  it('recusa título curto demais', async () => {
    const task = await criarTask();

    const res = await request(app).patch(`/api/tasks/${task._id}`).send({ title: 'ab' });

    expect(res.status).toBe(400);
    expect(res.body.campos.title).toBeDefined();
  });

  it('recusa corpo vazio', async () => {
    const task = await criarTask();

    const res = await request(app).patch(`/api/tasks/${task._id}`).send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ao menos um campo/);
  });

  it('recusa corpo só com campos não permitidos', async () => {
    const task = await criarTask();

    const res = await request(app)
      .patch(`/api/tasks/${task._id}`)
      .send({ _id: 'forjado', createdAt: '2020-01-01' });

    expect(res.status).toBe(400);
  });

  it('ignora campos não permitidos misturados com válidos', async () => {
    const task = await criarTask();

    const res = await request(app)
      .patch(`/api/tasks/${task._id}`)
      .send({ status: 'done', _id: 'forjado' });

    expect(res.status).toBe(200);
    expect(res.body._id).toBe(task._id.toString());
  });
});

describe('PATCH /api/tasks/:id — id', () => {
  it('devolve 404 para id válido inexistente', async () => {
    const res = await request(app)
      .patch(`/api/tasks/${new mongoose.Types.ObjectId()}`)
      .send({ status: 'done' });

    expect(res.status).toBe(404);
  });

  it('devolve 400 para id malformado', async () => {
    const res = await request(app).patch('/api/tasks/banana').send({ status: 'done' });

    expect(res.status).toBe(400);
  });
});

const request = require('supertest');
const mongoose = require('mongoose');

const app = require('../src/app');
const { Task } = require('../src/models/Task');
const { novoUsuario, conectarMongo } = require('./helpers');

let auth;
let userId;

// Declarado antes dos outros beforeEach: roda primeiro, então o seed
// já encontra userId preenchido.
beforeEach(async () => {
  const usuario = await novoUsuario();
  auth = usuario.auth;
  userId = usuario.id;
});

beforeAll(async () => {
  await conectarMongo();
});

afterEach(async () => {
  await Task.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('GET /api/tasks/:id', () => {
  it('devolve a task quando o id existe', async () => {
    const criada = await Task.create({ owner: userId, title: 'Buscar por id' });

    const res = await request(app).get(`/api/tasks/${criada._id}`).set('Authorization', auth);

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Buscar por id');
    expect(res.body._id).toBe(criada._id.toString());
  });

  it('devolve 404 para id válido que não existe', async () => {
    const idInexistente = new mongoose.Types.ObjectId();

    const res = await request(app).get(`/api/tasks/${idInexistente}`).set('Authorization', auth);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Task não encontrada');
  });

  it('devolve 400 para id malformado', async () => {
    const res = await request(app).get('/api/tasks/banana').set('Authorization', auth);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/não é um id válido/);
  });

  // Drivers antigos aceitavam qualquer string de 12 caracteres como ObjectId.
  // O bson 6 não aceita mais — o teste fica como guarda contra regressão.
  it('devolve 400 para string de 12 caracteres', async () => {
    const res = await request(app).get('/api/tasks/banana123456').set('Authorization', auth);

    expect(res.status).toBe(400);
  });

  it('aceita id em maiúsculas', async () => {
    const criada = await Task.create({ owner: userId, title: 'Hex maiúsculo' });

    const res = await request(app).get(`/api/tasks/${criada._id.toString().toUpperCase()}`).set('Authorization', auth);

    expect(res.status).toBe(200);
  });
});

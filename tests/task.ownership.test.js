const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../src/app');
const { Task } = require('../src/models/Task');
const { novoUsuario, conectarMongo } = require('./helpers');

let alice;
let bob;
let taskDaAlice;

beforeAll(async () => {
  await conectarMongo();
});

beforeEach(async () => {
  alice = await novoUsuario();
  bob = await novoUsuario();

  taskDaAlice = await Task.create({ owner: alice.id, title: 'Segredo da Alice' });
});

afterEach(async () => {
  await Task.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('Rotas de task exigem autenticação', () => {
  it('sem cabeçalho Authorization devolve 401', async () => {
    const res = await request(app).get('/api/tasks');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Token não fornecido');
  });

  it('com token adulterado devolve 401', async () => {
    const res = await request(app)
      .get('/api/tasks')
      .set('Authorization', 'Bearer nao.e.um.token');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Token inválido');
  });

  it('com token assinado por outro segredo devolve 401', async () => {
    const forjado = jwt.sign({ id: alice.id }, 'segredo-do-atacante');

    const res = await request(app)
      .get('/api/tasks')
      .set('Authorization', `Bearer ${forjado}`);

    expect(res.status).toBe(401);
  });

  it('com token expirado devolve 401 e diz que expirou', async () => {
    const expirado = jwt.sign({ id: alice.id }, process.env.JWT_SECRET, {
      expiresIn: '-1s',
    });

    const res = await request(app)
      .get('/api/tasks')
      .set('Authorization', `Bearer ${expirado}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Token expirado');
  });

  it.each([
    ['post', '/api/tasks'],
    ['get', '/api/tasks'],
    ['patch', '/api/tasks/507f1f77bcf86cd799439011'],
    ['delete', '/api/tasks/507f1f77bcf86cd799439011'],
  ])('%s %s exige token', async (metodo, rota) => {
    const res = await request(app)[metodo](rota);

    expect(res.status).toBe(401);
  });
});

describe('Um usuário não alcança as tasks de outro', () => {
  it('a listagem do Bob não inclui a task da Alice', async () => {
    const res = await request(app).get('/api/tasks').set('Authorization', bob.auth);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
  });

  it('a listagem da Alice inclui a task dela', async () => {
    const res = await request(app).get('/api/tasks').set('Authorization', alice.auth);

    expect(res.body.data).toHaveLength(1);
  });

  it('buscar por id devolve 404 para o Bob, não 403', async () => {
    const res = await request(app)
      .get(`/api/tasks/${taskDaAlice._id}`)
      .set('Authorization', bob.auth);

    // 403 confirmaria que esse id existe. 404 não diz nada.
    expect(res.status).toBe(404);
  });

  it('a resposta do Bob é idêntica para task alheia e id inexistente', async () => {
    const alheia = await request(app)
      .get(`/api/tasks/${taskDaAlice._id}`)
      .set('Authorization', bob.auth);

    const inexistente = await request(app)
      .get(`/api/tasks/${new mongoose.Types.ObjectId()}`)
      .set('Authorization', bob.auth);

    expect(alheia.status).toBe(inexistente.status);
    expect(alheia.body).toEqual(inexistente.body);
  });

  it('o Bob não consegue alterar a task da Alice', async () => {
    const res = await request(app)
      .patch(`/api/tasks/${taskDaAlice._id}`)
      .set('Authorization', bob.auth)
      .send({ title: 'Invadida pelo Bob' });

    expect(res.status).toBe(404);

    const noBanco = await Task.findById(taskDaAlice._id);
    expect(noBanco.title).toBe('Segredo da Alice');
  });

  it('o DELETE do Bob responde 204 mas NÃO apaga a task da Alice', async () => {
    const res = await request(app)
      .delete(`/api/tasks/${taskDaAlice._id}`)
      .set('Authorization', bob.auth);

    // 204 por ser idempotente e não vazar existência...
    expect(res.status).toBe(204);

    // ...mas a task da Alice continua viva.
    const noBanco = await Task.findById(taskDaAlice._id);
    expect(noBanco.deletedAt).toBeNull();
  });

  it('a Alice continua conseguindo apagar a própria task', async () => {
    const res = await request(app)
      .delete(`/api/tasks/${taskDaAlice._id}`)
      .set('Authorization', alice.auth);

    expect(res.status).toBe(204);

    const noBanco = await Task.findById(taskDaAlice._id);
    expect(noBanco.deletedAt).toBeInstanceOf(Date);
  });
});

describe('O dono vem do token, nunca do corpo', () => {
  it('ignora owner enviado no corpo ao criar', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', bob.auth)
      .send({ title: 'Tentativa de plantar task', owner: alice.id });

    expect(res.status).toBe(201);
    expect(res.body.owner).toBe(bob.id);
    expect(res.body.owner).not.toBe(alice.id);
  });

  it('ignora owner enviado no corpo ao atualizar', async () => {
    const minha = await Task.create({ owner: bob.id, title: 'Task do Bob' });

    const res = await request(app)
      .patch(`/api/tasks/${minha._id}`)
      .set('Authorization', bob.auth)
      .send({ status: 'done', owner: alice.id });

    expect(res.status).toBe(200);
    expect(res.body.owner).toBe(bob.id);
  });
});

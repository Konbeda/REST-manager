const request = require('supertest');
const mongoose = require('mongoose');
const { MongoDBContainer } = require('@testcontainers/mongodb');

const app = require('../src/app');
const { Task } = require('../src/models/Task');
const { novoUsuario } = require('./helpers');

let container;
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
  container = await new MongoDBContainer('mongo:7').start();
  await mongoose.connect(container.getConnectionString(), { directConnection: true });
});

// Datas explícitas: não dá pra confiar em createdAt quando os documentos
// são criados no mesmo milissegundo.
beforeEach(async () => {
  await Task.create([
    { owner: userId, title: 'Alpha', status: 'pending', dueDate: new Date('2026-01-03') },
    { owner: userId, title: 'Bravo', status: 'done', dueDate: new Date('2026-01-01') },
    { owner: userId, title: 'Charlie', status: 'pending', dueDate: new Date('2026-01-02') },
  ]);
});

afterEach(async () => {
  await Task.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await container.stop();
});

const titulos = (res) => res.body.data.map((t) => t.title);

describe('GET /api/tasks — padrões', () => {
  it('sem parâmetros, devolve tudo com a paginação padrão', async () => {
    const res = await request(app).get('/api/tasks').set('Authorization', auth);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 3,
      totalPages: 1,
    });
  });
});

describe('GET /api/tasks — paginação', () => {
  it('respeita o limit', async () => {
    const res = await request(app).get('/api/tasks?limit=2').set('Authorization', auth);

    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination.totalPages).toBe(2);
  });

  it('a segunda página traz o resto', async () => {
    const res = await request(app).get('/api/tasks?page=2&limit=2').set('Authorization', auth);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination.page).toBe(2);
  });

  it('página além do fim devolve lista vazia, não erro', async () => {
    const res = await request(app).get('/api/tasks?page=99').set('Authorization', auth);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.total).toBe(3);
  });

  it('limita o limit ao máximo permitido', async () => {
    const res = await request(app).get('/api/tasks?limit=5000').set('Authorization', auth);

    expect(res.body.pagination.limit).toBe(100);
  });

  it.each(['0', '-1', 'abc'])('recusa page=%s com 400', async (page) => {
    const res = await request(app).get(`/api/tasks?page=${page}`).set('Authorization', auth);

    expect(res.status).toBe(400);
  });
});

describe('GET /api/tasks — filtro por status', () => {
  it('devolve só as tasks do status pedido', async () => {
    const res = await request(app).get('/api/tasks?status=pending').set('Authorization', auth);

    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.every((t) => t.status === 'pending')).toBe(true);
  });

  it('o total reflete o filtro, não a coleção inteira', async () => {
    const res = await request(app).get('/api/tasks?status=done').set('Authorization', auth);

    expect(res.body.pagination.total).toBe(1);
  });

  it('recusa status fora do enum com 400', async () => {
    const res = await request(app).get('/api/tasks?status=pendente').set('Authorization', auth);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Status inválido/);
  });
});

describe('GET /api/tasks — ordenação', () => {
  it('ordena por campo crescente', async () => {
    const res = await request(app).get('/api/tasks?sort=title').set('Authorization', auth);

    expect(titulos(res)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('o prefixo "-" inverte a ordem', async () => {
    const res = await request(app).get('/api/tasks?sort=-title').set('Authorization', auth);

    expect(titulos(res)).toEqual(['Charlie', 'Bravo', 'Alpha']);
  });

  it('ordena por data', async () => {
    const res = await request(app).get('/api/tasks?sort=dueDate').set('Authorization', auth);

    expect(titulos(res)).toEqual(['Bravo', 'Charlie', 'Alpha']);
  });

  it('recusa ordenar por campo fora da lista branca', async () => {
    const res = await request(app).get('/api/tasks?sort=_id').set('Authorization', auth);

    expect(res.status).toBe(400);
  });
});

describe('GET /api/tasks — combinando parâmetros', () => {
  it('filtra, ordena e pagina ao mesmo tempo', async () => {
    const res = await request(app).get('/api/tasks?status=pending&sort=-title&limit=1').set('Authorization', auth);

    expect(titulos(res)).toEqual(['Charlie']);
    expect(res.body.pagination.total).toBe(2);
    expect(res.body.pagination.totalPages).toBe(2);
  });
});

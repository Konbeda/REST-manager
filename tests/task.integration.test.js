const mongoose = require('mongoose');
const { Task } = require('../src/models/Task');
const { conectarMongo } = require('./helpers');

// owner é obrigatório; aqui só interessa validar persistência, não posse.
const OWNER = new mongoose.Types.ObjectId();


// beforeAll roda UMA vez, antes de todos os testes deste arquivo.
// O contêiner é único para toda a suíte (ver tests/globalSetup.js); aqui só
// abrimos a conexão com o banco reservado a este worker.
beforeAll(async () => {
  await conectarMongo();
});

// Depois de CADA teste: banco limpo. É o que torna os testes independentes.
afterEach(async () => {
  await Task.deleteMany({});
});

// No fim do arquivo: fecha a conexão. O contêiner é derrubado pelo
// globalTeardown, depois que TODOS os arquivos terminarem.
afterAll(async () => {
  await mongoose.disconnect();
});

describe('Task (integração com Mongo real)', () => {
  it('grava e lê de volta', async () => {
    await Task.create({ owner: OWNER, title: 'Estudar Testcontainers' });

    const encontrada = await Task.findOne({ title: 'Estudar Testcontainers' });

    expect(encontrada).not.toBeNull();
    expect(encontrada.status).toBe('pending');
    expect(encontrada._id).toBeDefined();
  });

  it('preenche createdAt e updatedAt sozinho', async () => {
    const task = await Task.create({ owner: OWNER, title: 'Verificar timestamps' });

    expect(task.createdAt).toBeInstanceOf(Date);
    expect(task.updatedAt).toBeInstanceOf(Date);
  });

  it('recusa gravar sem título', async () => {
    await expect(Task.create({})).rejects.toThrow('O título é obrigatório');
  });

  it('recusa gravar com status fora do enum', async () => {
    await expect(Task.create({ owner: OWNER, title: 'Task válida', status: 'pendente' })).rejects.toThrow();
  });

  it('cada teste começa com o banco vazio', async () => {
    // Se o afterEach não funcionasse, os testes acima teriam deixado lixo aqui.
    expect(await Task.countDocuments()).toBe(0);
  });
});

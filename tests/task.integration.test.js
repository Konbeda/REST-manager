const mongoose = require('mongoose');
const { MongoDBContainer } = require('@testcontainers/mongodb');
const { Task } = require('../src/models/Task');

// owner é obrigatório; aqui só interessa validar persistência, não posse.
const OWNER = new mongoose.Types.ObjectId();

let container;

// beforeAll roda UMA vez, antes de todos os testes deste arquivo.
beforeAll(async () => {
  // Versão fixada: teste tem que rodar igual hoje e daqui a um ano.
  container = await new MongoDBContainer('mongo:7').start();

  // O container sobe um replica set de 1 nó; directConnection evita
  // que o driver tente descobrir os outros nós (que não existem).
  await mongoose.connect(container.getConnectionString(), { directConnection: true });
});

// Depois de CADA teste: banco limpo. É o que torna os testes independentes.
afterEach(async () => {
  await Task.deleteMany({});
});

// No fim do arquivo: fecha a conexão e destrói o contêiner.
afterAll(async () => {
  await mongoose.disconnect();
  await container.stop();
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

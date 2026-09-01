const request = require('supertest');
const mongoose = require('mongoose');

const app = require('../src/app');

const SENHA = 'senha-de-teste';

let contador = 0;

// Um contêiner só para toda a suíte (ver globalSetup), mas os workers rodam
// em paralelo — então cada um recebe o SEU banco dentro daquele contêiner.
// JEST_WORKER_ID é definido pelo Jest, um por worker.
function uriDoWorker() {
  const base = process.env.MONGO_TEST_URI;

  if (!base) {
    throw new Error('MONGO_TEST_URI ausente: o globalSetup não rodou?');
  }

  const url = new URL(base);
  url.pathname = `/test_worker_${process.env.JEST_WORKER_ID ?? '1'}`;

  return url.toString();
}

function conectarMongo() {
  // directConnection: o contêiner sobe um replica set de 1 nó, e sem isso
  // o driver tentaria descobrir os outros nós, que não existem.
  return mongoose.connect(uriDoWorker(), { directConnection: true });
}

// Cria um usuário novo e devolve o que os testes precisam para agir como ele.
// E-mail único por chamada: dois usuários no mesmo teste não colidem.
async function novoUsuario() {
  contador += 1;
  const email = `user-${contador}-${Date.now()}@exemplo.com`;

  const registro = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Usuário de Teste', email, password: SENHA });

  const login = await request(app)
    .post('/api/auth/login')
    .send({ email, password: SENHA });

  return {
    id: registro.body._id,
    token: login.body.token,
    auth: `Bearer ${login.body.token}`,
  };
}

module.exports = { novoUsuario, conectarMongo, SENHA };

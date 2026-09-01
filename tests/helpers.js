const request = require('supertest');

const app = require('../src/app');

const SENHA = 'senha-de-teste';

let contador = 0;

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

module.exports = { novoUsuario, SENHA };

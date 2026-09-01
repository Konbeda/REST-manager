const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const taskRoutes = require('./routes/taskRoutes');
const authRoutes = require('./routes/authRoutes');
const { errorHandler } = require('./middlewares/errorHandler');
const { authRateLimit } = require('./middlewares/rateLimit');

const app = express();

// Quantos proxies confiáveis existem à frente da aplicação.
// 0 (padrão) = nenhum: req.ip é a conexão direta e o X-Forwarded-For é
// ignorado. Confiar nesse cabeçalho sem proxy real na frente permitiria a
// qualquer cliente forjar o próprio IP e escapar do rate limit.
app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 0));

// Libera requisições vindas de outras origens (ex.: um front rodando em outra porta).
app.use(cors());

// Faz o Express ler corpos JSON e preencher req.body.
// Sem isso, req.body vem undefined em POST/PUT.
app.use(express.json());

// LIVENESS — "o processo está vivo?". Não consulta o banco de propósito:
// se responder, o processo está sadio e não precisa ser reiniciado.
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// READINESS — "esta instância consegue atender AGORA?". É o que o
// balanceador sonda: falhar aqui tira a instância do pool sem reiniciá-la.
app.get('/ready', (req, res) => {
  // 1 = connected. Sem banco, a API sobe mas não serve para nada.
  const bancoConectado = mongoose.connection.readyState === 1;

  // Durante o encerramento, mentimos de propósito: queremos sair do pool
  // antes de fechar a porta, para o balanceador parar de mandar tráfego.
  const encerrando = req.app.locals.encerrando === true;

  if (encerrando || !bancoConectado) {
    return res.status(503).json({
      status: 'unavailable',
      encerrando,
      banco: bancoConectado ? 'ok' : 'desconectado',
    });
  }

  return res.json({ status: 'ready' });
});

app.use('/api/auth', authRateLimit, authRoutes);
app.use('/api/tasks', taskRoutes);

// Sempre por ÚLTIMO: só recebe o que os middlewares anteriores jogaram.
app.use(errorHandler);

module.exports = app;

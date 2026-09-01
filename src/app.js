const express = require('express');
const cors = require('cors');

const taskRoutes = require('./routes/taskRoutes');
const authRoutes = require('./routes/authRoutes');
const { errorHandler } = require('./middlewares/errorHandler');

const app = express();

// Libera requisições vindas de outras origens (ex.: um front rodando em outra porta).
app.use(cors());

// Faz o Express ler corpos JSON e preencher req.body.
// Sem isso, req.body vem undefined em POST/PUT.
app.use(express.json());

// Rota de saúde: serve só pra confirmar que o servidor está de pé.
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);

// Sempre por ÚLTIMO: só recebe o que os middlewares anteriores jogaram.
app.use(errorHandler);

module.exports = app;

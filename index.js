require('dotenv').config();

const mongoose = require('mongoose');

const app = require('./src/app');
const { connectDatabase } = require('./src/config/database');
const { criarDesligamento } = require('./src/utils/desligamento');

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    const connection = await connectDatabase();
    console.log(`MongoDB conectado: ${connection.name}`);

    // O retorno do listen é o http.Server — precisamos dele para fechar.
    const server = app.listen(PORT, () => {
      console.log(`Servidor rodando em http://localhost:${PORT}`);
    });

    const desligar = criarDesligamento({
      server,
      // Faz o /ready passar a responder 503 sem derrubar o /health.
      aoFicharIndisponivel: () => {
        app.locals.encerrando = true;
      },
      fecharBanco: () => mongoose.connection.close(),
    });

    // SIGTERM: docker stop, Kubernetes, systemd. SIGINT: Ctrl+C.
    // No Windows o SIGTERM não é emitido de verdade — só dentro de contêiner.
    for (const sinal of ['SIGTERM', 'SIGINT']) {
      process.on(sinal, () => {
        desligar(sinal)
          .then(() => process.exit(0))
          .catch((err) => {
            console.error('falha no encerramento:', err);
            process.exit(1);
          });
      });
    }
  } catch (err) {
    console.error('Falha ao iniciar:', err.message);
    process.exit(1);
  }
}

start();

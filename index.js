require('dotenv').config();

const app = require('./src/app');
const { connectDatabase } = require('./src/config/database');

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    const connection = await connectDatabase();
    console.log(`MongoDB conectado: ${connection.name}`);

    app.listen(PORT, () => {
      console.log(`Servidor rodando em http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Falha ao iniciar:', err.message);
    process.exit(1);
  }
}

start();

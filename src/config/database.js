const mongoose = require('mongoose');

async function connectDatabase() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error('MONGODB_URI não definida. Copie o .env.example para .env e preencha.');
  }

  // Falha em ~10s em vez de ficar tentando em silêncio.
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });

  // Perdas de conexão DEPOIS do start caem aqui; o Mongoose reconecta sozinho.
  mongoose.connection.on('error', (err) => {
    console.error('Erro na conexão com o MongoDB:', err.message);
  });

  return mongoose.connection;
}

module.exports = { connectDatabase };

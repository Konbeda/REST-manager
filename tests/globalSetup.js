const { MongoDBContainer } = require('@testcontainers/mongodb');

// Roda UMA vez, antes de toda a suíte, no processo principal do Jest.
// Um contêiner só para todos os arquivos, em vez de um por arquivo.
module.exports = async function globalSetup() {
  const container = await new MongoDBContainer('mongo:7').start();

  // Variáveis definidas aqui são herdadas pelos workers, que só nascem depois.
  process.env.MONGO_TEST_URI = container.getConnectionString();

  // globalTeardown roda em outro módulo: guardamos a referência no globalThis.
  globalThis.__MONGO_CONTAINER__ = container;
};

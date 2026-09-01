module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  clearMocks: true,

  // Um contêiner MongoDB para toda a suíte, em vez de um por arquivo.
  globalSetup: '<rootDir>/tests/globalSetup.js',
  globalTeardown: '<rootDir>/tests/globalTeardown.js',

  setupFiles: ['<rootDir>/tests/setup.js'],

  // Baixar a imagem na primeira execução estoura os 5s padrão.
  testTimeout: 120000,
};

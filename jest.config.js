module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  clearMocks: true,
  setupFiles: ['<rootDir>/tests/setup.js'],
  // Subir contêiner (e baixar a imagem na primeira vez) estoura os 5s padrão.
  testTimeout: 120000,
};

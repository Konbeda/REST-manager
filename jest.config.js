module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  clearMocks: true,
  // Subir contêiner (e baixar a imagem na primeira vez) estoura os 5s padrão.
  testTimeout: 120000,
};

// Roda antes de cada arquivo de teste, antes dos imports dele.
// Testes não devem depender do .env da máquina — em CI ele não existe.
process.env.JWT_SECRET = 'segredo-de-teste-nao-usar-em-producao';

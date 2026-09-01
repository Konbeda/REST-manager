// Roda antes de cada arquivo de teste, antes dos imports dele.
// Testes não devem depender do .env da máquina — em CI ele não existe.
process.env.JWT_SECRET = 'segredo-de-teste-nao-usar-em-producao';

// Limites altíssimos por padrão: os testes de CRUD e auth fazem dezenas de
// chamadas e não devem esbarrar no rate limit. Os arquivos que testam os
// limites definem os seus próprios valores ANTES de importar o app.
process.env.RATE_LIMIT_AUTH_MAX = '1000000';
process.env.LOGIN_MAX_FALHAS = '1000000';

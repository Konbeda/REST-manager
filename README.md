# REST-manager

API REST para gerenciamento de tarefas, com autenticação por JWT. Cada
usuário enxerga e manipula apenas as próprias tasks.

Construída em camadas (rota → controller → service → model) e coberta por
testes de integração que rodam contra um MongoDB real em contêiner.

## Stack

| | |
|---|---|
| Runtime | Node.js 20+ |
| Framework | Express 5 |
| Banco | MongoDB (Mongoose 8) |
| Autenticação | JWT (`jsonwebtoken`) + `bcryptjs` |
| Testes | Jest, Supertest, Testcontainers |

## Requisitos

- **Node.js 20 ou superior**
- **MongoDB** — um cluster no [Atlas](https://www.mongodb.com/atlas) ou uma
  instância local
- **Docker** — somente para rodar os testes, que sobem contêineres MongoDB

## Configuração

```bash
npm install
```

Copie o arquivo de exemplo e preencha:

```bash
cp .env.example .env
```

| Variável | Descrição |
|---|---|
| `PORT` | Porta do servidor. Padrão: `3000` |
| `MONGODB_URI` | String de conexão. No Atlas: **Connect → Drivers**. Inclua o nome do banco antes do `?` |
| `JWT_SECRET` | Chave de assinatura dos tokens. **Nunca comite o valor real** |

Gere o `JWT_SECRET` com:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

O `.env` está no `.gitignore` e não deve ser versionado.

## Executando

```bash
npm run dev
```

O `--watch` reinicia o processo a cada alteração. Para rodar sem watch:

```bash
npm start
```

A aplicação conecta ao banco **antes** de abrir a porta. Se a conexão
falhar, o processo encerra com código 1 em vez de subir uma API que aceita
requisições e quebra em toda consulta.

## Testes

```bash
npm test
```

Requer Docker rodando. Cada arquivo de teste sobe seu próprio contêiner
MongoDB numa porta aleatória e o destrói no fim, então a suíte **nunca**
toca no banco de desenvolvimento.

A primeira execução baixa a imagem `mongo:7` (~300 MB) e pode levar alguns
minutos. As seguintes levam cerca de 20 segundos.

```bash
npm run test:watch          # reroda ao salvar
npx jest tests/task.patch   # apenas um arquivo
npx jest -t "recusa status" # apenas testes cujo nome casa
npx jest --coverage         # relatório de cobertura
```

## Endpoints

Base: `http://localhost:3000`

### Autenticação — público

#### `POST /api/auth/register`

```json
{ "name": "Victor", "email": "victor@exemplo.com", "password": "senha-secreta" }
```

`201` com o usuário criado, sem a senha. `409` se o e-mail já existir.
`400` em dados inválidos.

#### `POST /api/auth/login`

```json
{ "email": "victor@exemplo.com", "password": "senha-secreta" }
```

`200` com `{ "token": "eyJ..." }`. `401` em credencial inválida — com a
mesma mensagem para e-mail inexistente e senha errada.

### Tasks — exigem `Authorization: Bearer <token>`

| Método | Rota | Resposta |
|---|---|---|
| `POST` | `/api/tasks` | `201` com a task criada |
| `GET` | `/api/tasks` | `200` com `{ data, pagination }` |
| `GET` | `/api/tasks/:id` | `200` com a task |
| `PATCH` | `/api/tasks/:id` | `200` com a task atualizada |
| `DELETE` | `/api/tasks/:id` | `204`, sem corpo |

#### Parâmetros de `GET /api/tasks`

| Parâmetro | Padrão | Observação |
|---|---|---|
| `page` | `1` | Inteiro ≥ 1 |
| `limit` | `20` | Limitado a `100` |
| `status` | — | `pending`, `in_progress` ou `done` |
| `sort` | `-createdAt` | `createdAt`, `updatedAt`, `dueDate`, `title`, `status`. Prefixo `-` inverte |

```
GET /api/tasks?status=pending&sort=-dueDate&page=2&limit=10
```

```json
{
  "data": [ ... ],
  "pagination": { "page": 2, "limit": 10, "total": 42, "totalPages": 5 }
}
```

### `GET /health`

Público. Responde `{ "status": "ok", "uptime": 123.45 }` sem consultar o
banco — serve para distinguir "servidor fora do ar" de "banco fora do ar".

## Campos

### Task

| Campo | Regras |
|---|---|
| `title` | Obrigatório, 3–200 caracteres |
| `description` | Opcional, até 2000 caracteres |
| `status` | `pending` (padrão), `in_progress`, `done` |
| `dueDate` | Opcional |
| `owner` | Definido pelo servidor a partir do token; ignorado se enviado no corpo |
| `deletedAt` | Soft delete; não aceita valor do cliente |

### User

| Campo | Regras |
|---|---|
| `name` | Obrigatório, 2–120 caracteres |
| `email` | Obrigatório, único, normalizado para minúsculas |
| `password` | Obrigatório, mínimo 6 caracteres; armazenado com hash bcrypt e nunca retornado |

## Erros

Erro simples:

```json
{ "error": "Task não encontrada" }
```

Erro de validação, com os campos que falharam:

```json
{ "error": "Dados inválidos", "campos": { "title": "O título é obrigatório" } }
```

| Código | Quando |
|---|---|
| `400` | Dados ou parâmetros inválidos, id malformado |
| `401` | Token ausente, inválido ou expirado; credencial errada no login |
| `404` | Recurso inexistente **ou pertencente a outro usuário** |
| `409` | E-mail já cadastrado |
| `500` | Erro não previsto |

## Estrutura

```
index.js                    entrypoint: carrega .env, conecta, abre a porta
src/
  app.js                    monta o Express — não abre porta
  config/database.js        conexão com o MongoDB
  routes/                   mapeiam URL e método para o controller
  controllers/              falam HTTP: leem req, escolhem status
  services/                 regra de negócio — não conhecem req/res
  models/                   schemas do Mongoose
  middlewares/              autenticação e tratamento de erro
  utils/AppError.js         erro com status HTTP embutido
tests/                      suíte Jest
requests.http               requisições de exemplo (extensão REST Client)
```

`app.js` é separado de `index.js` de propósito: o app não abre porta, o que
permite testá-lo com Supertest sem subir servidor nem disputar a porta entre
os workers paralelos do Jest.

## Decisões de projeto

- **Autorização por filtro, não por verificação posterior.** Toda consulta
  de task inclui `owner` no critério. Assim "não existe" e "existe mas é de
  outro" produzem a mesma resposta `404`, sem confirmar a existência de ids
  alheios.
- **`DELETE` sempre responde `204`**, inclusive para id inexistente. É
  idempotente e não vaza informação.
- **Soft delete.** `DELETE` marca `deletedAt`; um índice TTL remove
  definitivamente após 30 dias, sem cron.
- **Lista branca de campos** na entrada, contra *mass assignment*, e de
  campos ordenáveis, já que ordenação por campo arbitrário vaza informação.
- **E-mail duplicado é detectado pelo índice único**, não por uma consulta
  prévia — o que elimina a janela de corrida entre verificar e gravar.
- **`PATCH` usa `runValidators`**, sem o qual o Mongoose ignora as
  validações do schema em atualizações.

## Limitações conhecidas

- **Enumeração de usuários por tempo de resposta no login**: o caminho
  "e-mail não existe" não paga o custo do `bcrypt.compare`. A correção seria
  uma comparação descartável para igualar o tempo.
- **Sem rate limiting**: nada impede tentativas repetidas de login.
- **Tokens não podem ser revogados.** Como o servidor não guarda estado,
  logout é do lado do cliente e trocar a senha não invalida tokens já
  emitidos. Mitigações usuais: expiração curta com refresh token, ou uma
  lista de revogação — que reintroduz estado no servidor.
- **CORS liberado para qualquer origem**, adequado a desenvolvimento e a ser
  restringido antes de produção.
- Ao rodar a suíte completa, o Jest emite um aviso de *worker teardown* pela
  disputa entre os contêineres no encerramento. Todos os testes passam, e
  cada arquivo roda limpo isoladamente. A solução seria compartilhar um
  contêiner via `globalSetup`.

## Licença

MIT — ver [LICENSE](LICENSE).

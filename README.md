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
| `TRUST_PROXY` | Quantos proxies confiáveis existem à frente. Padrão `0`. Ver [Rate limiting](#rate-limiting) |

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

Requer Docker rodando. Um único contêiner MongoDB sobe antes da suíte
(`globalSetup`) numa porta aleatória e é destruído no fim, então os testes
**nunca** tocam no banco de desenvolvimento.

O isolamento entre os workers paralelos é feito por **banco**, não por
contêiner: cada worker usa `test_worker_<JEST_WORKER_ID>` dentro da mesma
instância.

A primeira execução baixa a imagem `mongo:7` (~300 MB) e pode levar alguns
minutos. As seguintes levam cerca de 13 segundos.

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

### Sondas — públicas

São perguntas diferentes, e por isso são dois endpoints.

| Rota | Pergunta | Quem usa |
|---|---|---|
| `GET /health` | *liveness* — o processo está vivo? | orquestrador, para decidir **reiniciar** |
| `GET /ready` | *readiness* — consigo atender agora? | balanceador, para decidir **encaminhar** |

`/health` responde `{ "status": "ok", "uptime": 123.45 }` **sem consultar o
banco**, de propósito: uma instância que perdeu a conexão com o Mongo está
viva, e reiniciá-la não resolveria nada.

`/ready` responde `200 { "status": "ready" }` quando o banco está conectado
e a aplicação não está encerrando. Caso contrário, `503` — o que faz o
balanceador tirar a instância do pool sem que ninguém a reinicie.

## Encerramento gracioso

Ao receber `SIGTERM` ou `SIGINT`, a aplicação encerra em etapas:

1. `/ready` passa a responder `503`, **mas continua atendendo**
2. espera alguns segundos para o balanceador sondar e removê-la do pool —
   fechar antes disso faria o tráfego continuar chegando numa porta morta
3. `server.close()` recusa conexões novas e aguarda as em andamento;
   `closeIdleConnections()` roda em laço para não esperar o `keepAliveTimeout`
   de conexões keep-alive que ficam ociosas nesse meio-tempo
4. no prazo limite, `closeAllConnections()` derruba o que sobrou — melhor
   sacrificar algumas requisições do que estourar o prazo do supervisor
5. só então fecha o MongoDB, e sai com código `0`

| Variável | Padrão | O que é |
|---|---|---|
| `SHUTDOWN_ESPERA_LB_MS` | `3000` | espera até o balanceador notar o `503` |
| `SHUTDOWN_PRAZO_MS` | `10000` | prazo máximo de drenagem |

**A soma desses dois precisa caber no prazo do supervisor.** O `docker stop`
mata com `SIGKILL` depois do seu timeout (medido em 3 s na versão testada,
configurável com `--time`); no Kubernetes é o `terminationGracePeriodSeconds`,
30 s por padrão. Estourar significa `SIGKILL` no meio da drenagem — e código
de saída `137` no log.

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
| `429` | Rate limit excedido — por IP ou por conta. Traz `Retry-After` |
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
  middlewares/              autenticação, rate limit e tratamento de erro
  utils/AppError.js         erro com status HTTP embutido
  utils/desligamento.js     encerramento gracioso em etapas
tests/                      suíte Jest
requests.http               requisições de exemplo (extensão REST Client)
```

`app.js` é separado de `index.js` de propósito: o app não abre porta, o que
permite testá-lo com Supertest sem subir servidor nem disputar a porta entre
os workers paralelos do Jest.

## Rate limiting

As rotas de autenticação têm duas proteções, com propósitos diferentes.

**Por IP**, em `/api/auth/*` — 30 requisições por 15 minutos, em memória.
Resposta `429` com `Retry-After` e os cabeçalhos `RateLimit-*` padronizados.

**Por conta**, no login — 5 falhas por 15 minutos para o mesmo e-mail,
com contador no MongoDB. Existe porque um ataque distribuído por centenas
de máquinas escapa do limite por IP, mas não deste. A janela é contada a
partir da **primeira** falha e não é renovada pelas seguintes: renová-la
permitiria a um atacante manter a conta trancada indefinidamente. Um login
bem-sucedido zera o contador, e um índice TTL apaga os registros expirados.

Falhas são contabilizadas também para e-mails inexistentes — se só contassem
para contas reais, a diferença de comportamento revelaria quais existem.

### `TRUST_PROXY`

Diz ao Express quantos proxies confiáveis existem à frente da aplicação,
para que ele saiba qual entrada do `X-Forwarded-For` é o IP real do cliente.

| Valor | Quando |
|---|---|
| `0` (padrão) | sem proxy: o cabeçalho é ignorado e `req.ip` é a conexão direta |
| `1` | um proxy reverso (nginx, ALB) |
| `2` | dois — por exemplo Cloudflare na frente de um ALB |

**O padrão é `0` de propósito.** Confiar no `X-Forwarded-For` sem um proxy
real à frente permitiria a qualquer cliente forjar o próprio IP e tornar o
rate limit inútil — há teste cobrindo esse caso. Se a aplicação for publicada
atrás de um proxy e essa variável não for ajustada, o limite passará a contar
o IP do proxy, errando para o lado restritivo.

O limite da aplicação é **complementar** ao da borda (Cloudflare, WAF, nginx),
não substituto: a infraestrutura barra volume bruto antes de custar qualquer
coisa; a aplicação aplica regras que só ela conhece, como "falhas por conta".

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
- **Rate limit em duas camadas**, por IP e por conta: um ataque distribuído
  escapa do primeiro, mas não do segundo. E `TRUST_PROXY` tem padrão seguro
  (`0`), porque confiar no `X-Forwarded-For` sem proxy real tornaria o limite
  contornável com um cabeçalho forjado.

## Limitações conhecidas

- **Enumeração de usuários por tempo de resposta no login**: o caminho
  "e-mail não existe" não paga o custo do `bcrypt.compare`. A correção seria
  uma comparação descartável para igualar o tempo.
- **O rate limit por IP conta em memória**, por processo. Com uma instância
  funciona; com várias atrás de um balanceador, cada uma tem o próprio
  contador e o limite efetivo multiplica pelo número de instâncias. A correção
  é um store compartilhado (Redis) — a troca é do *store* do
  `express-rate-limit`, sem mexer no resto do código. O limite por conta não
  tem esse problema, por já viver no MongoDB.
- **Tokens não podem ser revogados.** Como o servidor não guarda estado,
  logout é do lado do cliente e trocar a senha não invalida tokens já
  emitidos. Mitigações usuais: expiração curta com refresh token, ou uma
  lista de revogação — que reintroduz estado no servidor.
- **CORS liberado para qualquer origem**, adequado a desenvolvimento e a ser
  restringido antes de produção.
- **Aviso intermitente de *worker teardown* do Jest**, que ocorria quando
  cada arquivo subia o próprio contêiner. Não voltou depois da migração para
  `globalSetup` — evidência a favor da hipótese de corrida no encerramento
  simultâneo, mas não prova, já que o aviso nunca foi reproduzível sob
  demanda. **Não** usar `--forceExit` se ele voltar: esconderia também um
  vazamento real. O caminho é isolar por combinação de arquivos, que foi
  como um vazamento de verdade (timer de rota não cancelado) acabou sendo
  encontrado nos testes de encerramento.

## Licença

MIT — ver [LICENSE](LICENSE).

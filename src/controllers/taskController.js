const taskService = require('../services/taskService');

// req.userId é preenchido pelo requireAuth; nenhuma rota daqui é pública.
// Sem try/catch: no Express 5, a promise rejeitada de um handler async
// é encaminhada automaticamente para o middleware de erro.
async function create(req, res) {
  const task = await taskService.createTask(req.body, req.userId);

  res.status(201).json(task);
}

async function list(req, res) {
  const resultado = await taskService.listTasks(req.query, req.userId);

  res.json(resultado);
}

async function getById(req, res) {
  const task = await taskService.getTaskById(req.params.id, req.userId);

  res.json(task);
}

async function update(req, res) {
  const task = await taskService.updateTask(req.params.id, req.body, req.userId);

  res.json(task);
}

async function remove(req, res) {
  await taskService.softDeleteTask(req.params.id, req.userId);

  // 204 não pode ter corpo: send() sem argumento, nunca json().
  res.status(204).send();
}

module.exports = { create, list, getById, update, remove };

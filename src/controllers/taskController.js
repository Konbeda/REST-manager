const taskService = require('../services/taskService');

// Sem try/catch: no Express 5, a promise rejeitada de um handler async
// é encaminhada automaticamente para o middleware de erro.
async function create(req, res) {
  const task = await taskService.createTask(req.body);

  res.status(201).json(task);
}

async function list(req, res) {
  const resultado = await taskService.listTasks(req.query);

  res.json(resultado);
}

async function getById(req, res) {
  const task = await taskService.getTaskById(req.params.id);

  res.json(task);
}

async function update(req, res) {
  const task = await taskService.updateTask(req.params.id, req.body);

  res.json(task);
}

async function remove(req, res) {
  await taskService.softDeleteTask(req.params.id);

  // 204 não pode ter corpo: send() sem argumento, nunca json().
  res.status(204).send();
}

module.exports = { create, list, getById, update, remove };

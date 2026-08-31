const mongoose = require('mongoose');

const { Task, TASK_STATUS } = require('../models/Task');
const { AppError } = require('../utils/AppError');

// Campos que o cliente pode definir. Tudo que não estiver aqui é descartado.
const CAMPOS_PERMITIDOS = ['title', 'description', 'status', 'dueDate'];

// Lista branca de ordenação: ordenar por campo arbitrário vaza informação.
const CAMPOS_ORDENAVEIS = ['createdAt', 'updatedAt', 'dueDate', 'title', 'status'];

// Toda leitura precisa excluir o que está na lixeira.
const NAO_DELETADAS = { deletedAt: null };

const LIMIT_PADRAO = 20;
const LIMIT_MAXIMO = 100;

function filtrarCampos(dados) {
  const limpo = {};
  for (const campo of CAMPOS_PERMITIDOS) {
    if (dados[campo] !== undefined) limpo[campo] = dados[campo];
  }
  return limpo;
}

// Query string chega SEMPRE como string: "2", nunca 2.
function parseInteiroPositivo(valor, padrao, nome) {
  if (valor === undefined) return padrao;

  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 1) {
    throw new AppError(`O parâmetro "${nome}" deve ser um inteiro maior que zero`);
  }

  return numero;
}

function montarFiltro(query) {
  const filtro = { ...NAO_DELETADAS };

  if (query.status !== undefined) {
    if (!TASK_STATUS.includes(query.status)) {
      throw new AppError(
        `Status inválido. Valores aceitos: ${TASK_STATUS.join(', ')}`,
      );
    }
    filtro.status = query.status;
  }

  return filtro;
}

// "title" => crescente; "-title" => decrescente.
function montarOrdenacao(sort) {
  if (sort === undefined) return { createdAt: -1 };

  const decrescente = sort.startsWith('-');
  const campo = decrescente ? sort.slice(1) : sort;

  if (!CAMPOS_ORDENAVEIS.includes(campo)) {
    throw new AppError(
      `Não é possível ordenar por "${campo}". Campos: ${CAMPOS_ORDENAVEIS.join(', ')}`,
    );
  }

  return { [campo]: decrescente ? -1 : 1 };
}

// Validar antes de consultar evita uma ida inútil ao banco e transforma
// o CastError do Mongoose (que viraria 500) num 400 com mensagem clara.
function garantirIdValido(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(`"${id}" não é um id válido`);
  }
}

async function createTask(dados) {
  return Task.create(filtrarCampos(dados));
}

async function updateTask(id, dados) {
  garantirIdValido(id);

  const campos = filtrarCampos(dados);

  // PATCH sem nenhum campo válido é engano do cliente, não sucesso vazio.
  if (Object.keys(campos).length === 0) {
    throw new AppError(
      `Envie ao menos um campo para atualizar: ${CAMPOS_PERMITIDOS.join(', ')}`,
    );
  }

  // findOneAndUpdate (e não findByIdAndUpdate) para poder exigir deletedAt: null.
  const task = await Task.findOneAndUpdate({ _id: id, ...NAO_DELETADAS }, campos, {
    new: true, // devolve o documento DEPOIS da alteração
    runValidators: true, // sem isto, o schema é ignorado no update
  });

  if (!task) {
    throw new AppError('Task não encontrada', 404);
  }

  return task;
}

// Idempotente por decisão de projeto: apagar o que já não existe é sucesso.
// Nunca lança 404 — isso evitaria confirmar quais ids existem.
async function softDeleteTask(id) {
  garantirIdValido(id);

  await Task.updateOne({ _id: id, ...NAO_DELETADAS }, { deletedAt: new Date() });
}

async function getTaskById(id) {
  garantirIdValido(id);

  const task = await Task.findOne({ _id: id, ...NAO_DELETADAS });

  if (!task) {
    throw new AppError('Task não encontrada', 404);
  }

  return task;
}

async function listTasks(query = {}) {
  const page = parseInteiroPositivo(query.page, 1, 'page');
  const limitPedido = parseInteiroPositivo(query.limit, LIMIT_PADRAO, 'limit');
  const limit = Math.min(limitPedido, LIMIT_MAXIMO);

  const filtro = montarFiltro(query);
  const ordenacao = montarOrdenacao(query.sort);

  // As duas consultas são independentes: em paralelo paga-se uma latência, não duas.
  const [data, total] = await Promise.all([
    Task.find(filtro)
      .sort(ordenacao)
      .skip((page - 1) * limit)
      .limit(limit),
    Task.countDocuments(filtro),
  ]);

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

module.exports = { createTask, listTasks, getTaskById, updateTask, softDeleteTask };

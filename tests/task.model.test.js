const mongoose = require('mongoose');

const { Task, TASK_STATUS } = require('../src/models/Task');

// owner é obrigatório no schema; qualquer ObjectId serve para validar o resto.
const OWNER = new mongoose.Types.ObjectId();

// Nenhum destes testes toca no banco: validateSync() roda em memória.
describe('Task (schema)', () => {
  it('aceita uma task mínima válida', () => {
    const task = new Task({ owner: OWNER, title: 'Comprar café' });
    expect(task.validateSync()).toBeUndefined();
  });

  it('exige dono', () => {
    const err = new Task({ title: 'Comprar café' }).validateSync();
    expect(err.errors.owner).toBeDefined();
  });

  it('exige título', () => {
    const err = new Task({}).validateSync();
    expect(err.errors.title.message).toBe('O título é obrigatório');
  });

  it('rejeita título com menos de 3 caracteres', () => {
    const err = new Task({ owner: OWNER, title: 'ab' }).validateSync();
    expect(err.errors.title).toBeDefined();
  });

  it('remove espaços nas pontas do título', () => {
    const task = new Task({ owner: OWNER, title: '   Comprar café   ' });
    expect(task.title).toBe('Comprar café');
  });

  it('assume status "pending" quando não informado', () => {
    const task = new Task({ owner: OWNER, title: 'Comprar café' });
    expect(task.status).toBe('pending');
  });

  it.each(TASK_STATUS)('aceita o status "%s"', (status) => {
    const task = new Task({ owner: OWNER, title: 'Comprar café', status });
    expect(task.validateSync()).toBeUndefined();
  });

  it('rejeita status fora do enum', () => {
    const err = new Task({ owner: OWNER, title: 'Comprar café', status: 'pendente' }).validateSync();
    expect(err.errors.status.message).toBe('`pendente` não é um status válido');
  });
});

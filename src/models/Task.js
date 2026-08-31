const mongoose = require('mongoose');

const TASK_STATUS = ['pending', 'in_progress', 'done'];

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'O título é obrigatório'],
      trim: true,
      minlength: [3, 'O título precisa ter ao menos 3 caracteres'],
      maxlength: [200, 'O título excede 200 caracteres'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, 'A descrição excede 2000 caracteres'],
      default: '',
    },
    status: {
      type: String,
      enum: { values: TASK_STATUS, message: '`{VALUE}` não é um status válido' },
      default: 'pending',
    },
    dueDate: {
      type: Date,
      default: null,
    },
    // Soft delete: null = viva. Nunca definido pelo cliente.
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// Lixeira automática: o Mongo apaga sozinho o que está na lixeira há 30 dias.
// Documentos com deletedAt null são ignorados pelo TTL (não são data).
const DIAS_ATE_REMOCAO_DEFINITIVA = 30;

taskSchema.index(
  { deletedAt: 1 },
  { expireAfterSeconds: DIAS_ATE_REMOCAO_DEFINITIVA * 24 * 60 * 60 },
);

const Task = mongoose.model('Task', taskSchema);

module.exports = { Task, TASK_STATUS };

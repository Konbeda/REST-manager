const Task = require('../models/Task');

exports.getAllTasks = async (req, res) => {
  const tasks = await Task.find();
  res.json(tasks);
};

exports.createTask = async (req, res) => {
  try {
    const { title, description } = req.body;
    const newTask = new Task({ title, description });
    const savedTask = await newTask.save();
    res.status(201).json(savedTask);
  } catch (err) {
    res.status(400).json({ message: 'Erro ao criar tarefa', error: err.message });
  }
};

exports.updateTask = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedTask = await Task.findByIdAndUpdate(id, req.body, { new: true });

    if(!updatedTask) {
      return res.status(404).json({ message: 'Tarefa não encontrada' });
    }

    res.json(updatedTask);
  } catch (err) {
    res.status(400).json({ message: 'Erro ao atualizar tarefa', error: err.message});
  }
}

exports.deleteTask = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedTask = await Task.findByIdAndDelete(id);

    if(!deletedTask) {
      return res.status(404).json({ message: 'Tarefa não encontrada' });
    }

    res.json({ message: 'Tarefa deletada com sucesso'});
  } catch (er) {
    res.status(400).json({ message: 'Erro ao deletar tarefa: ', error: err.message});
  }
}
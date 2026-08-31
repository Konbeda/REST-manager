const express = require('express');
const taskController = require('../controllers/taskController');

const router = express.Router();

router.post('/', taskController.create);
router.get('/', taskController.list);
router.get('/:id', taskController.getById);
router.patch('/:id', taskController.update);
router.delete('/:id', taskController.remove);

module.exports = router;

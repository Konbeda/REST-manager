const express = require('express');

const taskController = require('../controllers/taskController');
const { requireAuth } = require('../middlewares/authMiddleware');

const router = express.Router();

// Vale para TODAS as rotas abaixo: nenhuma task é pública.
router.use(requireAuth);

router.post('/', taskController.create);
router.get('/', taskController.list);
router.get('/:id', taskController.getById);
router.patch('/:id', taskController.update);
router.delete('/:id', taskController.remove);

module.exports = router;

const { Router } = require('express');
const clientsController = require('../controllers/clients.controller');
const authenticate = require('../middleware/auth');
const requireRole = require('../middleware/rbac');

const router = Router();

router.get('/', authenticate, clientsController.list);
router.post('/', authenticate, requireRole('admin', 'manager'), clientsController.create);
router.get('/:id', authenticate, clientsController.get);
router.put('/:id', authenticate, requireRole('admin', 'manager'), clientsController.update);
router.delete('/:id', authenticate, requireRole('admin', 'manager'), clientsController.remove);
router.post('/:id/accounts', authenticate, requireRole('admin', 'manager'), clientsController.assignAccount);

module.exports = router;

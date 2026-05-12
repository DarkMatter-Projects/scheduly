const clientService = require('../services/client.service');

async function list(req, res, next) {
  try {
    const clients = await clientService.listClients();
    res.json(clients);
  } catch (err) { next(err); }
}

async function get(req, res, next) {
  try {
    const client = await clientService.getClient(parseInt(req.params.id, 10));
    res.json(client);
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const { name, color, notes, teamId } = req.body;
    if (!name) return res.status(400).json({ error: 'Client name is required' });
    const client = await clientService.createClient({
      name, color, notes, teamId,
      createdBy: req.user.userId,
    });
    res.status(201).json(client);
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const client = await clientService.updateClient(parseInt(req.params.id, 10), req.body);
    res.json(client);
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    await clientService.deleteClient(parseInt(req.params.id, 10));
    res.json({ message: 'Client deleted' });
  } catch (err) { next(err); }
}

async function assignAccount(req, res, next) {
  try {
    const clientId = req.params.id === 'none' ? null : parseInt(req.params.id, 10);
    const { socialAccountId } = req.body;
    if (!socialAccountId) return res.status(400).json({ error: 'socialAccountId is required' });
    await clientService.assignAccount(clientId, parseInt(socialAccountId, 10));
    res.json({ message: 'Account assignment updated' });
  } catch (err) { next(err); }
}

module.exports = { list, get, create, update, remove, assignAccount };

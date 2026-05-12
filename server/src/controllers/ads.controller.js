const metaAds = require('../services/meta_ads.service');

async function listAccounts(req, res, next) {
  try {
    const { clientId } = req.query;
    const accounts = await metaAds.listAccounts({
      clientId: clientId ? parseInt(clientId, 10) : undefined,
    });
    res.json(accounts);
  } catch (err) { next(err); }
}

async function listCampaigns(req, res, next) {
  try {
    const { adAccountId, clientId } = req.query;
    const campaigns = await metaAds.listCampaigns({
      adAccountId: adAccountId ? parseInt(adAccountId, 10) : undefined,
      clientId: clientId ? parseInt(clientId, 10) : undefined,
    });
    res.json(campaigns);
  } catch (err) { next(err); }
}

async function getOverview(req, res, next) {
  try {
    const { clientId, days } = req.query;
    const data = await metaAds.getOverview({
      clientId: clientId ? parseInt(clientId, 10) : undefined,
      days: days ? Math.max(1, Math.min(90, parseInt(days, 10))) : 30,
    });
    res.json(data);
  } catch (err) { next(err); }
}

async function syncAll(req, res, next) {
  try {
    const result = await metaAds.syncAll();
    res.json(result);
  } catch (err) { next(err); }
}

async function syncOne(req, res, next) {
  try {
    const result = await metaAds.syncOne(parseInt(req.params.id, 10));
    res.json(result);
  } catch (err) { next(err); }
}

async function assignAccountClient(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const clientId = req.body?.clientId == null ? null : parseInt(req.body.clientId, 10);
    await metaAds.assignAccountToClient(id, clientId);
    res.json({ message: 'Updated' });
  } catch (err) { next(err); }
}

module.exports = { listAccounts, listCampaigns, getOverview, syncAll, syncOne, assignAccountClient };

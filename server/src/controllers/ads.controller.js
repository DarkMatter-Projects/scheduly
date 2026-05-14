const metaAds = require('../services/meta_ads.service');
const googleAds = require('../services/google_ads.service');
const tiktokAds = require('../services/tiktok_ads.service');

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
    const { clientId, days, start, end } = req.query;
    const data = await metaAds.getOverview({
      clientId: clientId ? parseInt(clientId, 10) : undefined,
      days: days ? Math.max(1, Math.min(365, parseInt(days, 10))) : 30,
      start: start || undefined,
      end: end || undefined,
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

async function disconnectAccount(req, res, next) {
  try {
    await metaAds.disconnectAccount(parseInt(req.params.id, 10));
    res.json({ message: 'Ad account removed' });
  } catch (err) { next(err); }
}

// ── Google Ads ──

async function listGoogleAccounts(req, res, next) {
  try {
    const { clientId } = req.query;
    const accounts = await googleAds.listAccounts({
      clientId: clientId ? parseInt(clientId, 10) : undefined,
    });
    res.json(accounts);
  } catch (err) { next(err); }
}

async function listGooglePendingGrants(req, res, next) {
  try {
    const grants = await googleAds.listPendingGrants({ userId: req.user.userId });
    res.json(grants);
  } catch (err) { next(err); }
}

async function getGoogleOverview(req, res, next) {
  try {
    const { clientId, days, start, end } = req.query;
    const data = await googleAds.getOverview({
      clientId: clientId ? parseInt(clientId, 10) : undefined,
      days: days ? Math.max(1, Math.min(365, parseInt(days, 10))) : 30,
      start: start || undefined,
      end: end || undefined,
    });
    res.json(data);
  } catch (err) { next(err); }
}

async function syncAllGoogle(req, res, next) {
  try {
    const result = await googleAds.syncAll();
    res.json(result);
  } catch (err) { next(err); }
}

async function syncOneGoogle(req, res, next) {
  try {
    const result = await googleAds.syncOne(parseInt(req.params.id, 10));
    res.json(result);
  } catch (err) { next(err); }
}

async function discoverGoogleGrant(req, res, next) {
  try {
    const result = await googleAds.discoverAccounts(parseInt(req.params.grantId, 10));
    res.json({ discovered: result.length, accounts: result });
  } catch (err) {
    if (err.code === 'NO_DEV_TOKEN') {
      return res.status(409).json({ error: err.message, code: 'NO_DEV_TOKEN' });
    }
    next(err);
  }
}

async function assignGoogleAccountClient(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const clientId = req.body?.clientId == null ? null : parseInt(req.body.clientId, 10);
    await googleAds.assignAccountToClient(id, clientId);
    res.json({ message: 'Updated' });
  } catch (err) { next(err); }
}

async function disconnectGoogleAccount(req, res, next) {
  try {
    await googleAds.disconnectAccount(parseInt(req.params.id, 10));
    res.json({ message: 'Ad account removed' });
  } catch (err) { next(err); }
}

async function disconnectGoogleGrant(req, res, next) {
  try {
    await googleAds.disconnectGrant(parseInt(req.params.grantId, 10), req.user.userId);
    res.json({ message: 'Google account disconnected' });
  } catch (err) { next(err); }
}

// ── TikTok Ads ──

async function listTikTokAccounts(req, res, next) {
  try {
    const { clientId } = req.query;
    const accounts = await tiktokAds.listAccounts({
      clientId: clientId ? parseInt(clientId, 10) : undefined,
    });
    res.json(accounts);
  } catch (err) { next(err); }
}

async function listTikTokPendingGrants(req, res, next) {
  try {
    const grants = await tiktokAds.listPendingGrants({ userId: req.user.userId });
    res.json(grants);
  } catch (err) { next(err); }
}

async function getTikTokOverview(req, res, next) {
  try {
    const { clientId, days, start, end } = req.query;
    const data = await tiktokAds.getOverview({
      clientId: clientId ? parseInt(clientId, 10) : undefined,
      days: days ? Math.max(1, Math.min(365, parseInt(days, 10))) : 30,
      start: start || undefined,
      end: end || undefined,
    });
    res.json(data);
  } catch (err) { next(err); }
}

async function syncAllTikTok(req, res, next) {
  try {
    const result = await tiktokAds.syncAll();
    res.json(result);
  } catch (err) { next(err); }
}

async function syncOneTikTok(req, res, next) {
  try {
    const result = await tiktokAds.syncOne(parseInt(req.params.id, 10));
    res.json(result);
  } catch (err) { next(err); }
}

async function discoverTikTokGrant(req, res, next) {
  try {
    const result = await tiktokAds.discoverAccounts(parseInt(req.params.grantId, 10));
    res.json({ discovered: result.length, accounts: result });
  } catch (err) { next(err); }
}

async function assignTikTokAccountClient(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const clientId = req.body?.clientId == null ? null : parseInt(req.body.clientId, 10);
    await tiktokAds.assignAccountToClient(id, clientId);
    res.json({ message: 'Updated' });
  } catch (err) { next(err); }
}

async function disconnectTikTokAccount(req, res, next) {
  try {
    await tiktokAds.disconnectAccount(parseInt(req.params.id, 10));
    res.json({ message: 'Ad account removed' });
  } catch (err) { next(err); }
}

async function disconnectTikTokGrant(req, res, next) {
  try {
    await tiktokAds.disconnectGrant(parseInt(req.params.grantId, 10), req.user.userId);
    res.json({ message: 'TikTok account disconnected' });
  } catch (err) { next(err); }
}

module.exports = {
  listAccounts, listCampaigns, getOverview, syncAll, syncOne, assignAccountClient, disconnectAccount,
  listGoogleAccounts, listGooglePendingGrants, getGoogleOverview,
  syncAllGoogle, syncOneGoogle, discoverGoogleGrant,
  assignGoogleAccountClient, disconnectGoogleAccount, disconnectGoogleGrant,
  listTikTokAccounts, listTikTokPendingGrants, getTikTokOverview,
  syncAllTikTok, syncOneTikTok, discoverTikTokGrant,
  assignTikTokAccountClient, disconnectTikTokAccount, disconnectTikTokGrant,
};

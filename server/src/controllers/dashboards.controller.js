const pool = require('../config/db');
const dashboardService = require('../services/dashboard.service');
const { buildWidgetData } = require('../services/dashboard_data.service');
const { METRICS } = require('../services/dashboard_metrics');

// JSON columns come back from mysql2 already parsed in recent versions but as
// strings in older configs. Tolerate both, plus null.
function parseJsonish(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return null; }
}

async function list(req, res, next) {
  try {
    const { clientId } = req.query;
    const data = await dashboardService.listDashboards({
      userId: req.user.userId,
      clientId: clientId ? parseInt(clientId, 10) : undefined,
    });
    res.json(data);
  } catch (err) { next(err); }
}

async function get(req, res, next) {
  try {
    const d = await dashboardService.getDashboard(parseInt(req.params.id, 10));
    res.json(d);
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const { name, templateKey, description, clientId, teamId, defaultRange, rangeStart, rangeEnd, widgets, channelIds } = req.body;
    if (!name) return res.status(400).json({ error: 'Dashboard name is required' });
    const d = await dashboardService.createDashboard({
      name, templateKey, description, clientId, teamId,
      defaultRange, rangeStart, rangeEnd, widgets, channelIds,
      createdBy: req.user.userId,
    });
    res.status(201).json(d);
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const d = await dashboardService.updateDashboard(parseInt(req.params.id, 10), req.body);
    res.json(d);
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    await dashboardService.deleteDashboard(parseInt(req.params.id, 10));
    res.json({ message: 'Dashboard deleted' });
  } catch (err) { next(err); }
}

// ── widgets ──

async function addWidget(req, res, next) {
  try {
    const w = await dashboardService.addWidget(parseInt(req.params.id, 10), req.body);
    res.status(201).json(w);
  } catch (err) { next(err); }
}

async function updateWidget(req, res, next) {
  try {
    const w = await dashboardService.updateWidget(parseInt(req.params.widgetId, 10), req.body);
    if (!w) return res.status(404).json({ error: 'Widget not found' });
    res.json(w);
  } catch (err) { next(err); }
}

async function deleteWidget(req, res, next) {
  try {
    await dashboardService.deleteWidget(parseInt(req.params.widgetId, 10));
    res.json({ message: 'Widget deleted' });
  } catch (err) { next(err); }
}

async function reorderWidgets(req, res, next) {
  try {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds[] is required' });
    await dashboardService.reorderWidgets(parseInt(req.params.id, 10), orderedIds.map(Number));
    res.json({ message: 'Reordered' });
  } catch (err) { next(err); }
}

// ── share ──

async function createShare(req, res, next) {
  try {
    const t = await dashboardService.createShareToken(
      parseInt(req.params.id, 10),
      req.user.userId,
      { expiresAt: req.body?.expiresAt || null }
    );
    res.status(201).json({
      id: t.id,
      token: t.token,
      access: t.access,
      expiresAt: t.expires_at,
      createdAt: t.created_at,
    });
  } catch (err) { next(err); }
}

async function revokeShare(req, res, next) {
  try {
    await dashboardService.revokeShareToken(parseInt(req.params.tokenId, 10));
    res.json({ message: 'Share link revoked' });
  } catch (err) { next(err); }
}

async function listMetrics(req, res, next) {
  try {
    // Front-end uses this to populate the metric picker. Static list — fine
    // to return whole.
    res.json(METRICS);
  } catch (err) { next(err); }
}

async function getWidgetData(req, res, next) {
  try {
    const widgetId = parseInt(req.params.widgetId, 10);
    const [wrows] = await pool.execute(
      'SELECT * FROM dashboard_widgets WHERE id = ?',
      [widgetId]
    );
    if (wrows.length === 0) return res.status(404).json({ error: 'Widget not found' });
    const widget = wrows[0];
    // mysql2 already auto-parses JSON columns, so the raw value is either
    // an array/object or a string. parseJsonish handles both, plus null.
    widget.channelIds = parseJsonish(widget.channel_ids) || [];
    widget.metricKeys = parseJsonish(widget.metric_keys) || [];
    widget.config     = parseJsonish(widget.config) || {};

    const [drows] = await pool.execute('SELECT * FROM dashboards WHERE id = ?', [widget.dashboard_id]);
    if (drows.length === 0) return res.status(404).json({ error: 'Dashboard not found' });

    // Dashboard-level scope priority:
    //   1. Union of every widget's channelIds (existing behaviour)
    //   2. The dashboard's own dashboards.channel_ids JSON (lets the user
    //      seed an empty Custom dashboard with the accounts they picked
    //      in the template wizard — widgets added later inherit it)
    //   3. null → "all accessible accounts" fallback inside the data
    //      resolver
    const [allWidgets] = await pool.execute(
      'SELECT channel_ids FROM dashboard_widgets WHERE dashboard_id = ?',
      [widget.dashboard_id]
    );
    const scopeSet = new Set();
    for (const w of allWidgets) {
      const ids = parseJsonish(w.channel_ids) || [];
      for (const id of ids) scopeSet.add(Number(id));
    }
    if (scopeSet.size === 0) {
      const dashboardChannelIds = parseJsonish(drows[0].channel_ids) || [];
      for (const id of dashboardChannelIds) scopeSet.add(Number(id));
    }
    const dashboard = { ...drows[0], effectiveChannelIds: [...scopeSet] };

    const data = await buildWidgetData(dashboard, widget);
    res.json(data);
  } catch (err) { next(err); }
}

// Public, no-auth viewer resolver. Returns the dashboard payload for a token.
async function viewShared(req, res, next) {
  try {
    const resolved = await dashboardService.resolveShareToken(req.params.token);
    if (!resolved) return res.status(404).json({ error: 'Share link not found or expired' });
    const dashboard = await dashboardService.getDashboard(resolved.dashboardId);
    // Strip internal share-link list from the public payload.
    delete dashboard.shareLinks;
    res.json(dashboard);
  } catch (err) { next(err); }
}

module.exports = {
  list, get, create, update, remove,
  addWidget, updateWidget, deleteWidget, reorderWidgets,
  createShare, revokeShare, viewShared,
  listMetrics, getWidgetData,
};

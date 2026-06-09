const pool = require('../config/db');
const dashboardService = require('../services/dashboard.service');
const { buildWidgetData } = require('../services/dashboard_data.service');
const { METRICS } = require('../services/dashboard_metrics');
const annotationsService = require('../services/annotations.service');

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
    const result = await buildWidgetDataById(widgetId);
    res.status(result.status).json(result.body);
  } catch (err) { next(err); }
}

// Shared helper used by both the auth + share-token widget data
// endpoints. Looks up the widget + dashboard, computes the same
// effectiveChannelIds fallback chain, and calls the resolver.
async function buildWidgetDataById(widgetId) {
  const [wrows] = await pool.execute(
    'SELECT * FROM dashboard_widgets WHERE id = ?',
    [widgetId]
  );
  if (wrows.length === 0) return { status: 404, body: { error: 'Widget not found' } };
  const widget = wrows[0];
  widget.channelIds = parseJsonish(widget.channel_ids) || [];
  widget.metricKeys = parseJsonish(widget.metric_keys) || [];
  widget.config     = parseJsonish(widget.config) || {};

  const [drows] = await pool.execute('SELECT * FROM dashboards WHERE id = ?', [widget.dashboard_id]);
  if (drows.length === 0) return { status: 404, body: { error: 'Dashboard not found' } };

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
  return { status: 200, body: data, widget, dashboardId: widget.dashboard_id };
}

// Public, share-token-scoped widget data fetch. Validates that the
// widget belongs to the dashboard the token resolves to so a token
// holder can't pivot to other widgets/dashboards by IDing them.
async function viewSharedWidgetData(req, res, next) {
  try {
    const resolved = await dashboardService.resolveShareToken(req.params.token);
    if (!resolved) return res.status(404).json({ error: 'Share link not found or expired' });
    const widgetId = parseInt(req.params.widgetId, 10);
    const result = await buildWidgetDataById(widgetId);
    if (result.status !== 200) return res.status(result.status).json(result.body);
    if (result.dashboardId !== resolved.dashboardId) {
      // Token holder asking for a widget that lives on a different
      // dashboard. 404 to avoid leaking that the widget exists.
      return res.status(404).json({ error: 'Widget not found' });
    }
    res.json(result.body);
  } catch (err) { next(err); }
}

// Public, share-token-scoped annotations fetch. Same shape as the
// authenticated /annotations endpoint but token-gated.
async function viewSharedAnnotations(req, res, next) {
  try {
    const resolved = await dashboardService.resolveShareToken(req.params.token);
    if (!resolved) return res.status(404).json({ error: 'Share link not found or expired' });
    const rows = await annotationsService.listForDashboard(resolved.dashboardId);
    res.json(rows);
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

async function listAnnotations(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const rows = await annotationsService.listForDashboard(id);
    res.json(rows);
  } catch (err) { next(err); }
}

async function createAnnotation(req, res, next) {
  try {
    const dashboardId = parseInt(req.params.id, 10);
    const [drows] = await pool.execute(
      `SELECT client_id, team_id FROM dashboards WHERE id = ?`,
      [dashboardId]
    );
    if (drows.length === 0) return res.status(404).json({ error: 'Dashboard not found' });
    const { occurredAt, label, description, color, scope } = req.body || {};
    // scope: 'dashboard' (default) ties to this dashboard only.
    //        'client'   ties to the dashboard's client so other dashboards
    //                   for the same client pick up the marker too.
    const a = await annotationsService.create({
      dashboardId: scope === 'client' ? null : dashboardId,
      clientId:    scope === 'client' ? drows[0].client_id : null,
      teamId:      drows[0].team_id,
      occurredAt, label, description, color,
      createdBy:   req.user.userId,
    });
    res.status(201).json(a);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

async function updateAnnotation(req, res, next) {
  try {
    const a = await annotationsService.update(parseInt(req.params.annotationId, 10), req.body || {});
    res.json(a);
  } catch (err) { next(err); }
}

async function deleteAnnotation(req, res, next) {
  try {
    await annotationsService.remove(parseInt(req.params.annotationId, 10));
    res.status(204).end();
  } catch (err) { next(err); }
}

module.exports = {
  list, get, create, update, remove,
  addWidget, updateWidget, deleteWidget, reorderWidgets,
  createShare, revokeShare, viewShared, viewSharedWidgetData, viewSharedAnnotations,
  listMetrics, getWidgetData,
  listAnnotations, createAnnotation, updateAnnotation, deleteAnnotation,
};

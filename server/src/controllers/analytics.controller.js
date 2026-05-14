const analyticsService = require('../services/analytics.service');

async function getPostAnalytics(req, res, next) {
  try {
    const postId = parseInt(req.params.id, 10);
    const data = await analyticsService.getPostAnalytics(postId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function getOverview(req, res, next) {
  try {
    const { start, end, clientId } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end query params are required' });
    }
    const data = await analyticsService.getOverviewAnalytics(
      start,
      end,
      clientId ? parseInt(clientId, 10) : null
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function fetchInsights(req, res, next) {
  try {
    const postTargetId = parseInt(req.params.postTargetId, 10);
    const metrics = await analyticsService.fetchInsightsForTarget(postTargetId);
    res.json(metrics);
  } catch (err) {
    next(err);
  }
}

async function refreshPost(req, res, next) {
  try {
    const postId = parseInt(req.params.postId, 10);
    const result = await analyticsService.refreshPostInsights(postId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { getPostAnalytics, getOverview, fetchInsights, refreshPost };

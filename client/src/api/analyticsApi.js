import api from './axiosInstance';

export const getOverviewAnalytics = (start, end, clientId) =>
  api.get('/analytics/overview', { params: { start, end, clientId } }).then(r => r.data);

export const getPostAnalytics = (postId) =>
  api.get(`/analytics/posts/${postId}`).then(r => r.data);

export const fetchInsights = (postTargetId) =>
  api.post(`/analytics/fetch/${postTargetId}`).then(r => r.data);

export const refreshPostInsights = (postId) =>
  api.post(`/analytics/posts/${postId}/refresh`).then(r => r.data);

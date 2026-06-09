import api from './axiosInstance';

export const getRecentActivity = (params) =>
  api.get('/activity', { params }).then(r => r.data);

export const listAuditLog = (params) =>
  api.get('/activity/log', { params }).then(r => r.data);

export const getActivityFacets = () =>
  api.get('/activity/facets').then(r => r.data);

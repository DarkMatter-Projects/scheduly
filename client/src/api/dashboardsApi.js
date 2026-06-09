import api from './axiosInstance';

export const listDashboards = (clientId) =>
  api.get('/dashboards', { params: { clientId } }).then(r => r.data);

export const getDashboard = (id) =>
  api.get(`/dashboards/${id}`).then(r => r.data);

export const createDashboard = (data) =>
  api.post('/dashboards', data).then(r => r.data);

export const updateDashboard = (id, data) =>
  api.put(`/dashboards/${id}`, data).then(r => r.data);

export const deleteDashboard = (id) =>
  api.delete(`/dashboards/${id}`).then(r => r.data);

export const addWidget = (dashboardId, widget) =>
  api.post(`/dashboards/${dashboardId}/widgets`, widget).then(r => r.data);

export const updateWidget = (widgetId, fields) =>
  api.put(`/dashboards/widgets/${widgetId}`, fields).then(r => r.data);

export const deleteWidget = (widgetId) =>
  api.delete(`/dashboards/widgets/${widgetId}`).then(r => r.data);

export const reorderWidgets = (dashboardId, orderedIds) =>
  api.put(`/dashboards/${dashboardId}/widgets/order`, { orderedIds }).then(r => r.data);

export const createShareLink = (dashboardId, opts = {}) =>
  api.post(`/dashboards/${dashboardId}/share`, opts).then(r => r.data);

export const revokeShareLink = (tokenId) =>
  api.delete(`/dashboards/share/${tokenId}`).then(r => r.data);

// Public viewer — no auth required.
export const fetchSharedDashboard = (token) =>
  api.get(`/dashboards/share/${token}`).then(r => r.data);

export const fetchSharedWidgetData = (token, widgetId) =>
  api.get(`/dashboards/share/${token}/widgets/${widgetId}/data`).then(r => r.data);

export const fetchSharedAnnotations = (token) =>
  api.get(`/dashboards/share/${token}/annotations`).then(r => r.data);

export const listAvailableMetrics = () =>
  api.get('/dashboards/metrics').then(r => r.data);

export const getWidgetData = (widgetId) =>
  api.get(`/dashboards/widgets/${widgetId}/data`).then(r => r.data);

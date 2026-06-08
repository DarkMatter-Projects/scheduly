import api from './client';

export const listAnnotations = (dashboardId) =>
  api.get(`/dashboards/${dashboardId}/annotations`).then(r => r.data);

export const createAnnotation = (dashboardId, payload) =>
  api.post(`/dashboards/${dashboardId}/annotations`, payload).then(r => r.data);

export const updateAnnotation = (id, payload) =>
  api.put(`/dashboards/annotations/${id}`, payload).then(r => r.data);

export const deleteAnnotation = (id) =>
  api.delete(`/dashboards/annotations/${id}`).then(r => r.data);

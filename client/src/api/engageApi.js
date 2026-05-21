import api from './axiosInstance';

export const listThreads = (params) =>
  api.get('/engage/threads', { params }).then(r => r.data);

export const getThreadCounts = (params) =>
  api.get('/engage/threads/counts', { params }).then(r => r.data);

export const getThread = (id) =>
  api.get(`/engage/threads/${id}`).then(r => r.data);

export const markThreadRead = (id) =>
  api.post(`/engage/threads/${id}/read`).then(r => r.data);

export const setThreadStatus = (id, status) =>
  api.post(`/engage/threads/${id}/status`, { status }).then(r => r.data);

export const assignThread = (id, userId) =>
  api.post(`/engage/threads/${id}/assign`, { userId }).then(r => r.data);

export const replyToThread = (id, body) =>
  api.post(`/engage/threads/${id}/reply`, { body }).then(r => r.data);

export const addThreadNote = (id, body) =>
  api.post(`/engage/threads/${id}/notes`, { body }).then(r => r.data);

export const deleteThreadNote = (noteId) =>
  api.delete(`/engage/threads/notes/${noteId}`).then(r => r.data);

export const refreshEngageInbox = () =>
  api.post('/engage/refresh').then(r => r.data);

export const bulkUpdateThreads = ({ threadIds, action }) =>
  api.post('/engage/threads/bulk', { threadIds, action }).then(r => r.data);

export const listReplyTemplates = () =>
  api.get('/engage/templates').then(r => r.data);

export const createReplyTemplate = ({ name, body }) =>
  api.post('/engage/templates', { name, body }).then(r => r.data);

export const updateReplyTemplate = (id, { name, body }) =>
  api.put(`/engage/templates/${id}`, { name, body }).then(r => r.data);

export const deleteReplyTemplate = (id) =>
  api.delete(`/engage/templates/${id}`).then(r => r.data);

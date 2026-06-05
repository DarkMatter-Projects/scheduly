import api from './axiosInstance';

export const listPosts = (params) =>
  api.get('/posts', { params }).then(r => r.data);

export const getPost = (id) =>
  api.get(`/posts/${id}`).then(r => r.data);

export const createPost = (data) =>
  api.post('/posts', data).then(r => r.data);

export const updatePost = (id, data) =>
  api.put(`/posts/${id}`, data).then(r => r.data);

export const deletePost = (id) =>
  api.delete(`/posts/${id}`).then(r => r.data);

export const submitForApproval = (id) =>
  api.post(`/posts/${id}/submit`).then(r => r.data);

export const approvePost = (id) =>
  api.post(`/posts/${id}/approve`).then(r => r.data);

export const rejectPost = (id, note) =>
  api.post(`/posts/${id}/reject`, { note }).then(r => r.data);

export const schedulePost = (id, scheduledAt) =>
  api.post(`/posts/${id}/schedule`, { scheduledAt }).then(r => r.data);

export const publishNow = (id) =>
  api.post(`/posts/${id}/publish-now`).then(r => r.data);

export const refreshTiktokTargetStatus = (targetId) =>
  api.get(`/posts/targets/${targetId}/tiktok-status`).then(r => r.data);

export const generateCaption = ({ prompt, platforms, tone }) =>
  api.post('/posts/ai-caption', { prompt, platforms, tone }, { timeout: 60000 }).then(r => r.data);

export const bulkCreatePosts = (posts) =>
  api.post('/posts/bulk', { posts }, { timeout: 120000 }).then(r => r.data);

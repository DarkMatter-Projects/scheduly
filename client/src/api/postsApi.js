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

export const setTargetPinned = (targetId, pinned) =>
  api.post(`/posts/targets/${targetId}/pin`, { pinned }).then(r => r.data);

// Tokenized approval links — surface in PostDetailPage; created/revoked
// by the agency, consumed by the brand stakeholder via a public page.
export const createApprovalToken = (postId, opts = {}) =>
  api.post(`/posts/${postId}/approval-tokens`, opts).then(r => r.data);

export const listApprovalTokens = (postId) =>
  api.get(`/posts/${postId}/approval-tokens`).then(r => r.data);

export const revokeApprovalToken = (tokenId) =>
  api.delete(`/posts/approval-tokens/${tokenId}`).then(r => r.data);

// Public, no-auth endpoints used by ApprovePage.
export const fetchApprovalLink = (token) =>
  api.get(`/approve/${token}`).then(r => r.data);

export const submitApprovalDecision = (token, payload) =>
  api.post(`/approve/${token}/decide`, payload).then(r => r.data);

// Place autocomplete for the composer geotag picker (FB Pages search +
// X geo/search). Returns { results, notice? }.
export const searchPlaces = (platform, query) =>
  api.get('/posts/geo-search', { params: { platform, q: query } }).then(r => r.data);

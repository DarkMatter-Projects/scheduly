import api from './axiosInstance';

export const listAccounts = () =>
  api.get('/social/accounts').then(r => r.data);

export const startFacebookAuth = (teamId) =>
  api.get('/social/auth/facebook', { params: { teamId } }).then(r => r.data);

export const startInstagramAuth = (teamId) =>
  api.get('/social/auth/instagram', { params: { teamId } }).then(r => r.data);

export const startGoogleAuth = (teamId) =>
  api.get('/social/auth/google', { params: { teamId } }).then(r => r.data);

export const startTiktokLoginAuth = (teamId) =>
  api.get('/social/auth/tiktok-login', { params: { teamId } }).then(r => r.data);

export const startTikTokAuth = (teamId) =>
  api.get('/social/auth/tiktok', { params: { teamId } }).then(r => r.data);

export const startLinkedinAuth = (teamId) =>
  api.get('/social/auth/linkedin', { params: { teamId } }).then(r => r.data);

export const startTwitterAuth = (teamId) =>
  api.get('/social/auth/twitter', { params: { teamId } }).then(r => r.data);

export const startYoutubeAuth = (teamId) =>
  api.get('/social/auth/youtube', { params: { teamId } }).then(r => r.data);

export const getYoutubeQuota = () =>
  api.get('/social/youtube/quota').then(r => r.data);

export const disconnectAccount = (id) =>
  api.delete(`/social/accounts/${id}`).then(r => r.data);

export const reconnectAccount = (id) =>
  api.post(`/social/accounts/${id}/reconnect`).then(r => r.data);

export const importHistory = (id) =>
  api.post(`/social/accounts/${id}/import-history`, undefined, { timeout: 600000 }).then(r => r.data);

// IG Catalog product search for the composer's product-tag picker.
// Returns { products, notice? }.
export const searchInstagramProducts = (accountId, query) =>
  api.get(`/social/accounts/${accountId}/instagram-products`, { params: { q: query } }).then(r => r.data);

// TikTok creator info — required by TikTok's Content Sharing Guidelines
// (§1) before rendering the Post-to-TikTok page. Returns privacy
// options, per-account interaction disables, and posting caps.
export const getTiktokCreatorInfo = (accountId) =>
  api.get(`/social/accounts/${accountId}/tiktok-creator-info`).then(r => r.data);

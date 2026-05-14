import api from './axiosInstance';

export const listAdAccounts = (clientId) =>
  api.get('/ads/accounts', { params: { clientId } }).then(r => r.data);

export const listCampaigns = (params) =>
  api.get('/ads/campaigns', { params }).then(r => r.data);

export const getAdsOverview = (params) =>
  api.get('/ads/overview', { params }).then(r => r.data);

export const syncAllAds = () =>
  api.post('/ads/sync').then(r => r.data);

export const syncAdAccount = (id) =>
  api.post(`/ads/accounts/${id}/sync`).then(r => r.data);

export const assignAdAccountClient = (id, clientId) =>
  api.post(`/ads/accounts/${id}/client`, { clientId }).then(r => r.data);

export const disconnectAdAccount = (id) =>
  api.delete(`/ads/accounts/${id}`).then(r => r.data);

// ── Google Ads ──
export const listGoogleAdAccounts = (clientId) =>
  api.get('/ads/google/accounts', { params: { clientId } }).then(r => r.data);

export const listGooglePendingGrants = () =>
  api.get('/ads/google/pending-grants').then(r => r.data);

export const getGoogleAdsOverview = (params) =>
  api.get('/ads/google/overview', { params }).then(r => r.data);

export const syncAllGoogleAds = () =>
  api.post('/ads/google/sync').then(r => r.data);

export const syncGoogleAdAccount = (id) =>
  api.post(`/ads/google/accounts/${id}/sync`).then(r => r.data);

export const discoverGoogleGrant = (grantId) =>
  api.post(`/ads/google/grants/${grantId}/discover`).then(r => r.data);

export const rediscoverAllGoogle = () =>
  api.post('/ads/google/rediscover-all').then(r => r.data);

export const assignGoogleAdAccountClient = (id, clientId) =>
  api.post(`/ads/google/accounts/${id}/client`, { clientId }).then(r => r.data);

export const disconnectGoogleAdAccount = (id) =>
  api.delete(`/ads/google/accounts/${id}`).then(r => r.data);

export const disconnectGoogleGrant = (grantId) =>
  api.delete(`/ads/google/grants/${grantId}`).then(r => r.data);

// ── TikTok Ads ──
export const listTikTokAdAccounts = (clientId) =>
  api.get('/ads/tiktok/accounts', { params: { clientId } }).then(r => r.data);

export const listTikTokPendingGrants = () =>
  api.get('/ads/tiktok/pending-grants').then(r => r.data);

export const getTikTokAdsOverview = (params) =>
  api.get('/ads/tiktok/overview', { params }).then(r => r.data);

export const syncAllTikTokAds = () =>
  api.post('/ads/tiktok/sync').then(r => r.data);

export const syncTikTokAdAccount = (id) =>
  api.post(`/ads/tiktok/accounts/${id}/sync`).then(r => r.data);

export const discoverTikTokGrant = (grantId) =>
  api.post(`/ads/tiktok/grants/${grantId}/discover`).then(r => r.data);

export const rediscoverAllTikTok = () =>
  api.post('/ads/tiktok/rediscover-all').then(r => r.data);

export const assignTikTokAdAccountClient = (id, clientId) =>
  api.post(`/ads/tiktok/accounts/${id}/client`, { clientId }).then(r => r.data);

export const disconnectTikTokAdAccount = (id) =>
  api.delete(`/ads/tiktok/accounts/${id}`).then(r => r.data);

export const disconnectTikTokGrant = (grantId) =>
  api.delete(`/ads/tiktok/grants/${grantId}`).then(r => r.data);

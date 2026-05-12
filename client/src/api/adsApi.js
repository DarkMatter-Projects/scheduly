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

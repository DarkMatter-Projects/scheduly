import api from './axiosInstance';

export const listAccounts = () =>
  api.get('/social/accounts').then(r => r.data);

export const startFacebookAuth = (teamId) =>
  api.get('/social/auth/facebook', { params: { teamId } }).then(r => r.data);

export const startInstagramAuth = (teamId) =>
  api.get('/social/auth/instagram', { params: { teamId } }).then(r => r.data);

export const startGoogleAuth = (teamId) =>
  api.get('/social/auth/google', { params: { teamId } }).then(r => r.data);

export const disconnectAccount = (id) =>
  api.delete(`/social/accounts/${id}`).then(r => r.data);

export const reconnectAccount = (id) =>
  api.post(`/social/accounts/${id}/reconnect`).then(r => r.data);

export const importHistory = (id) =>
  api.post(`/social/accounts/${id}/import-history`, undefined, { timeout: 600000 }).then(r => r.data);

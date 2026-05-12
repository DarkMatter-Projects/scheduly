import api from './axiosInstance';

export const listClients = () =>
  api.get('/clients').then(r => r.data);

export const getClient = (id) =>
  api.get(`/clients/${id}`).then(r => r.data);

export const createClient = (data) =>
  api.post('/clients', data).then(r => r.data);

export const updateClient = (id, data) =>
  api.put(`/clients/${id}`, data).then(r => r.data);

export const deleteClient = (id) =>
  api.delete(`/clients/${id}`).then(r => r.data);

export const assignAccountToClient = (clientId, socialAccountId) => {
  const segment = clientId == null ? 'none' : clientId;
  return api.post(`/clients/${segment}/accounts`, { socialAccountId }).then(r => r.data);
};

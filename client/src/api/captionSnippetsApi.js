import api from './axiosInstance';

export const listCaptionSnippets = (search) =>
  api.get('/caption-snippets', { params: search ? { q: search } : {} }).then(r => r.data);

export const createCaptionSnippet = ({ title, body, teamId }) =>
  api.post('/caption-snippets', { title, body, teamId }).then(r => r.data);

export const updateCaptionSnippet = (id, payload) =>
  api.put(`/caption-snippets/${id}`, payload).then(r => r.data);

export const deleteCaptionSnippet = (id) =>
  api.delete(`/caption-snippets/${id}`).then(r => r.data);

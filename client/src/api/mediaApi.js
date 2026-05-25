import api from './axiosInstance';

export const listMedia = (params) =>
  api.get('/media', { params }).then(r => r.data);

export const uploadMedia = (files, { onProgress } = {}) => {
  const formData = new FormData();
  files.forEach(file => formData.append('files', file));
  const totalBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
  return api.post('/media/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    // Long timeout for big videos. The server still has its own limit.
    timeout: 600000,
    onUploadProgress: (e) => {
      if (!onProgress) return;
      const loaded = e.loaded || 0;
      const total = e.total || totalBytes || 0;
      const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
      onProgress({ loaded, total, percent });
    },
  }).then(r => r.data);
};

export const deleteMedia = (id) =>
  api.delete(`/media/${id}`).then(r => r.data);

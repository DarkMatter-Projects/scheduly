import api from './axiosInstance';

export const getCalendarEvents = (start, end, clientId) =>
  api.get('/calendar', { params: { start, end, clientId } }).then(r => r.data);

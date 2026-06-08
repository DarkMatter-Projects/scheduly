import api from './axiosInstance';

export const listNotifications = (unreadOnly = false) =>
  api.get('/notifications', { params: unreadOnly ? { unreadOnly: 1 } : {} }).then(r => r.data);

export const notificationsUnreadCount = () =>
  api.get('/notifications/unread-count').then(r => r.data);

export const markNotificationRead = (id) =>
  api.post(`/notifications/${id}/read`).then(r => r.data);

export const markAllNotificationsRead = () =>
  api.post('/notifications/read-all').then(r => r.data);

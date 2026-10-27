export const useBadgeNotifications = () => {
  return { 
    unreadCount: 0,
    notificationScores: [],
    markAsRead: async () => {},
    refresh: async () => {}
  };
};

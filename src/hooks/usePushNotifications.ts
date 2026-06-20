import { useCallback, useEffect, useState } from 'react';

type PushPermission = NotificationPermission | 'unsupported';

export const usePushNotifications = () => {
  const [permission, setPermission] = useState<PushPermission>(() =>
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );

  useEffect(() => {
    if ('serviceWorker' in navigator) void navigator.serviceWorker.ready;
  }, []);

  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) return 'unsupported' as const;
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, []);

  return { permission, requestPermission, isSupported: permission !== 'unsupported' };
};

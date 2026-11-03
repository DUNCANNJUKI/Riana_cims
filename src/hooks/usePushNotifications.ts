import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/integrations/apiClient';
import { getCommunicationDeviceId } from '@/utils/communicationDevice';

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
    if (result === 'granted' && 'serviceWorker' in navigator && 'PushManager' in window) {
      const configuration = await apiClient.get('/communication/push-configuration') as { publicKey?: string; configured?: boolean };
      if (configuration.configured && configuration.publicKey) {
        const padding = '='.repeat((4 - configuration.publicKey.length % 4) % 4);
        const base64 = (configuration.publicKey + padding).replace(/-/g, '+').replace(/_/g, '/');
        const applicationServerKey = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
        await apiClient.put('/communication/push-subscriptions', {
          device_id: getCommunicationDeviceId(),
          device_label: navigator.platform || 'Web browser',
          subscription: subscription.toJSON(),
        });
      }
    }
    return result;
  }, []);

  const removeSubscription = useCallback(async () => {
    if (!('serviceWorker' in navigator)) return;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) await subscription.unsubscribe();
    await apiClient.delete(`/communication/push-subscriptions/${encodeURIComponent(getCommunicationDeviceId())}`);
  }, []);

  return { permission, requestPermission, removeSubscription, isSupported: permission !== 'unsupported' && 'PushManager' in window };
};

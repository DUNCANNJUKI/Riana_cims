import { useEffect } from 'react';

export function useRealtimeSubscription() {
  useEffect(() => {
    // Realtime disabled in local fallback
    return () => { };
  }, []);
}

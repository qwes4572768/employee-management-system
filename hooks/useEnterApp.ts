import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { useSession } from '@/providers/SessionProvider';

export function useEnterAppWhenReady() {
  const router = useRouter();
  const { session, user, ready } = useSession();
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    if (!entering || !ready) {
      return;
    }
    if (session && user?.status === 'active') {
      router.replace('/(main)');
    }
  }, [entering, ready, session, user, router]);

  return {
    entering,
    enterApp: () => setEntering(true),
  };
}

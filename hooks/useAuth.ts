import { useSession } from '@/providers/SessionProvider';

export function useAuth() {
  return useSession();
}

export function useCan() {
  const { can } = useSession();
  return can;
}

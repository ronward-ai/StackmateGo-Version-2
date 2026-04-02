
import { useQuery } from "@tanstack/react-query";

interface AnonymousUser {
  id: string;
  playerName: string;
  tournamentId: string;
  joinedAt: string;
  isAnonymous: true;
}

export function useAuth() {
  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  // Check for anonymous user in localStorage
  const getAnonymousUser = (): AnonymousUser | null => {
    try {
      const anonymousData = localStorage.getItem('anonymousUser');
      return anonymousData ? { ...JSON.parse(anonymousData), isAnonymous: true } : null;
    } catch {
      return null;
    }
  };

  const anonymousUser = getAnonymousUser();
  const effectiveUser = user || anonymousUser;

  return {
    user: effectiveUser,
    isLoading,
    isAuthenticated: !!effectiveUser,
    isAnonymous: !!anonymousUser && !user,
  };
}

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { authClient } from '@/lib/auth/auth-client';

/** Sign-out (FR-AUTH-02): POST /api/auth/sign-out → cache cleared → /sign-in. Used by the shell and Settings → Account. */
export function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    setFailed(false);
    const result = await authClient.signOut().catch(() => ({ error: true }));
    if (result.error) {
      setSigningOut(false);
      setFailed(true);
      return;
    }
    try {
      queryClient.clear();
      await navigate('/sign-in', { replace: true });
    } catch (error) {
      // Only on failure: re-rendering the still-mounted shell after clear() would refetch /me during the navigation.
      setSigningOut(false);
      throw error;
    }
  }

  return { signOut, signingOut, failed };
}

import { CircleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { authClient } from '@/lib/auth/auth-client';
import { safeNext } from '@/lib/auth/safe-next';
import { browser } from '@/lib/browser';
import { env } from '@/lib/env';
import { signInErrorMessage } from '../components/sign-in-error';

const SETUP_DOCS_URL = 'https://github.com/Oleg-Baltarovych/Applyra#google-sign-in-local';
const FAILED = 'Sign-in failed, try again';

/** /sign-in (10 §2.1, FR-AUTH-01/02). Also the OAuth errorCallbackURL: `?error=` is shown once, then dropped. */
export function SignInPage() {
  const [params, setParams] = useSearchParams();
  const [errorMessage, setErrorMessage] = useState(() => signInErrorMessage(params.get('error')));
  const [pending, setPending] = useState(false);
  const alertRef = useRef<HTMLDivElement>(null);
  const errorOnArrival = useRef(errorMessage !== null);
  const next = safeNext(params.get('next'));

  // An OAuth error arrives with a full page load: focus the alert so screen readers announce it.
  useEffect(() => {
    if (errorOnArrival.current) alertRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!params.has('error')) return;
    setParams(
      (current) => {
        const cleaned = new URLSearchParams(current);
        cleaned.delete('error');
        cleaned.delete('error_description');
        return cleaned;
      },
      { replace: true },
    );
  }, [params, setParams]);

  async function signInWithGoogle() {
    setPending(true);
    setErrorMessage(null);
    const origin = browser.origin();
    try {
      const { data } = await authClient.signIn.social({
        provider: 'google',
        callbackURL: origin + next,
        errorCallbackURL: `${origin}/sign-in`,
        disableRedirect: true,
      });
      if (data && 'url' in data && data.url) {
        browser.assign(data.url);
        return;
      }
    } catch {
      // Network failure: same generic message as a rejected request.
    }
    setPending(false);
    setErrorMessage(FAILED);
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <h1 className="text-xl">Sign in to Applyra</h1>
          </CardTitle>
          <CardDescription>Your personal job-search workspace.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {errorMessage && (
            <div
              ref={alertRef}
              role="alert"
              tabIndex={-1}
              className="flex items-start gap-2 rounded-md border border-destructive p-3 text-sm text-destructive"
            >
              <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
          {env.authGoogleEnabled ? (
            <Button onClick={() => void signInWithGoogle()} disabled={pending} aria-busy={pending}>
              {pending ? 'Redirecting to Google…' : 'Continue with Google'}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              No sign-in method is configured.{' '}
              <a className="text-primary underline underline-offset-4" href={SETUP_DOCS_URL}>
                See the README to set up Google sign-in
              </a>
              .
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

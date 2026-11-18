// Typed accessor for the public build-time env (VITE_* only — bundle-public, never a secret). Read once at startup.
import { z } from 'zod';

const WebEnv = z
  .object({
    VITE_API_URL: z
      .url({ protocol: /^https?$/, error: 'must be an http(s) URL' })
      .transform((url) => url.replace(/\/+$/, '')),
    /** Google sign-in button (10 §2.1); set true together with the api's GOOGLE_* credentials. */
    VITE_AUTH_GOOGLE_ENABLED: z
      .enum(['true', 'false', ''], { error: 'must be true or false' })
      .optional()
      .transform((flag) => flag === 'true'),
    /** Vite sets it for `vite build`; production must talk to the API over https (cookies are Secure, 09 §4). */
    PROD: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.PROD) return;
    const url = new URL(value.VITE_API_URL);
    if (url.protocol === 'http:' && url.hostname !== 'localhost') {
      ctx.addIssue({
        code: 'custom',
        path: ['VITE_API_URL'],
        message: 'must be https in production',
      });
    }
  });

export type WebEnv = { apiUrl: string; authGoogleEnabled: boolean };

/** Throws one error listing every invalid key (`KEY: reason`). `localhost` stays allowed for `vite preview`. */
export function parseWebEnv(raw: Record<string, unknown>): WebEnv {
  const result = WebEnv.safeParse(raw);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid web env:\n${lines.join('\n')}`);
  }
  return {
    apiUrl: result.data.VITE_API_URL,
    authGoogleEnabled: result.data.VITE_AUTH_GOOGLE_ENABLED,
  };
}

export const env: WebEnv = parseWebEnv(import.meta.env);

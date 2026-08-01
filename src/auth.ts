import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { resolveScopes, DEFAULT_SCOPE_GROUPS, type ScopeGroup } from './scopes';

export interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
  /**
   * The long-lived refresh token minted once by `google-connect authorize`.
   * Its presence is what makes this library headless: no login page, no
   * cookies, no session to expire.
   */
  refreshToken: string;
}

export interface AuthOptions extends Partial<GoogleCredentials> {
  /** Only needed for the interactive authorize flow, never at runtime. */
  redirectUri?: string;
}

const ENV_HINT = `
Add these to your .env.local (or Vercel project settings):

  GOOGLE_CLIENT_ID=...
  GOOGLE_CLIENT_SECRET=...
  GOOGLE_REFRESH_TOKEN=...

Run \`npx google-connect authorize\` to mint the refresh token.`;

/**
 * Read credentials from the environment, failing loudly and specifically.
 *
 * A missing refresh token is by far the most common setup mistake, so it is
 * reported separately from the client id/secret pair.
 */
export function credentialsFromEnv(
  overrides: Partial<GoogleCredentials> = {}
): GoogleCredentials {
  const clientId = overrides.clientId ?? process.env.GOOGLE_CLIENT_ID;
  const clientSecret = overrides.clientSecret ?? process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = overrides.refreshToken ?? process.env.GOOGLE_REFRESH_TOKEN;

  const missing: string[] = [];
  if (!clientId) missing.push('GOOGLE_CLIENT_ID');
  if (!clientSecret) missing.push('GOOGLE_CLIENT_SECRET');
  if (!refreshToken) missing.push('GOOGLE_REFRESH_TOKEN');

  if (missing.length > 0) {
    throw new Error(
      `google-connect: missing ${missing.join(', ')}.\n${ENV_HINT}`
    );
  }

  return {
    clientId: clientId!,
    clientSecret: clientSecret!,
    refreshToken: refreshToken!,
  };
}

/**
 * Build an authenticated client ready for any Google API call.
 *
 * google-auth-library transparently exchanges the refresh token for a fresh
 * access token whenever the current one is near expiry, so callers never deal
 * with token lifetimes.
 */
export function getAuthClient(options: AuthOptions = {}): OAuth2Client {
  const { clientId, clientSecret, refreshToken } = credentialsFromEnv(options);

  const client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    options.redirectUri
  );
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

/**
 * Verify the credentials actually work, without touching any user data.
 * Useful as a health check after deploying to a new environment.
 */
export async function verifyConnection(
  options: AuthOptions = {}
): Promise<{ ok: true; scopes: string[]; expiresInSeconds: number }> {
  const client = getAuthClient(options);
  const { token } = await client.getAccessToken();

  if (!token) {
    throw new Error(
      'google-connect: refresh token was rejected. It may have expired ' +
        '(apps in "Testing" publishing status issue 7-day refresh tokens) ' +
        'or access may have been revoked. Re-run `npx google-connect authorize`.'
    );
  }

  const info = await client.getTokenInfo(token);
  return {
    ok: true,
    scopes: info.scopes ?? [],
    expiresInSeconds: Math.max(
      0,
      Math.round((info.expiry_date - Date.now()) / 1000)
    ),
  };
}

// --- Interactive flow, used only by the authorize CLI -----------------------

export function buildConsentUrl(
  options: AuthOptions & { scopeGroups?: ScopeGroup[] }
): string {
  const clientId = options.clientId ?? process.env.GOOGLE_CLIENT_ID;
  const clientSecret = options.clientSecret ?? process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      'google-connect: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required to authorize.'
    );
  }

  const client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    options.redirectUri
  );

  return client.generateAuthUrl({
    // access_type=offline is what makes Google return a refresh token at all.
    access_type: 'offline',
    // prompt=consent forces a *new* refresh token even if one was issued
    // before; without it a repeat authorization returns only an access token.
    prompt: 'consent',
    scope: resolveScopes(options.scopeGroups ?? DEFAULT_SCOPE_GROUPS),
  });
}

export async function exchangeCodeForTokens(
  code: string,
  options: AuthOptions
): Promise<{ refreshToken: string; scopes: string[] }> {
  const clientId = options.clientId ?? process.env.GOOGLE_CLIENT_ID;
  const clientSecret = options.clientSecret ?? process.env.GOOGLE_CLIENT_SECRET;

  const client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    options.redirectUri
  );

  const { tokens } = await client.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error(
      'Google did not return a refresh token. This happens when the app was ' +
        'already authorized without prompt=consent. Revoke access at ' +
        'https://myaccount.google.com/permissions and try again.'
    );
  }

  return {
    refreshToken: tokens.refresh_token,
    scopes: tokens.scope ? tokens.scope.split(' ') : [],
  };
}

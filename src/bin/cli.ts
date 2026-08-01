#!/usr/bin/env node
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { buildConsentUrl, exchangeCodeForTokens, verifyConnection } from '../auth';
import { DEFAULT_SCOPE_GROUPS, SCOPES, type ScopeGroup } from '../scopes';

const PORT = 5555;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

// --- helpers ---------------------------------------------------------------

/**
 * Load .env files from the working directory so the CLI can be run inside any
 * project that already has its client id and secret configured.
 * Deliberately minimal: no dependency, no interpolation, existing env wins.
 */
function loadEnvFiles(): void {
  for (const file of ['.env.local', '.env']) {
    const full = path.resolve(process.cwd(), file);
    if (!fs.existsSync(full)) continue;

    for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!match) continue;

      const [, key, rawValue] = match;
      if (process.env[key]) continue;
      process.env[key] = rawValue.replace(/^["']|["']$/g, '');
    }
  }
}

function openBrowser(url: string): void {
  try {
    if (process.platform === 'win32') {
      // cmd.exe treats & as a command separator, and Node only quotes
      // arguments containing spaces — so an OAuth URL arrives truncated at
      // its first parameter, which Google rejects as a missing response_type.
      // Quote the URL explicitly and pass the command line through verbatim.
      spawn('cmd', ['/c', 'start', '""', `"${url}"`], {
        detached: true,
        stdio: 'ignore',
        windowsVerbatimArguments: true,
      }).unref();
      return;
    }

    const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
    spawn(opener, [url], { detached: true, stdio: 'ignore' }).unref();
  } catch {
    // Non-fatal: the URL is always printed, so the user can open it manually.
  }
}

function parseScopeGroups(argv: string[]): ScopeGroup[] {
  const flagIndex = argv.findIndex((arg) => arg === '--scopes');
  if (flagIndex === -1 || !argv[flagIndex + 1]) return DEFAULT_SCOPE_GROUPS;

  const requested = argv[flagIndex + 1].split(',').map((s) => s.trim().toUpperCase());
  const valid = Object.keys(SCOPES);

  for (const group of requested) {
    if (!valid.includes(group)) {
      console.error(`Unknown scope group "${group}".`);
      console.error(`Valid groups: ${valid.join(', ')}`);
      process.exit(1);
    }
  }

  return requested as ScopeGroup[];
}

const PAGE = (title: string, body: string) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>
  body { font-family: system-ui, sans-serif; display: grid; place-items: center;
         min-height: 100vh; margin: 0; background: #0d1117; color: #e6edf3; }
  .card { text-align: center; padding: 2.5rem 3rem; background: #161b22;
          border: 1px solid #30363d; border-radius: 12px; max-width: 32rem; }
  h1 { margin: 0 0 .5rem; font-size: 1.4rem; }
  p { margin: 0; color: #8b949e; line-height: 1.6; }
</style></head>
<body><div class="card"><h1>${title}</h1><p>${body}</p></div></body></html>`;

// --- commands --------------------------------------------------------------

/**
 * Run the consent flow once and print a long-lived refresh token.
 *
 * A throwaway localhost server catches Google's redirect, so the user never has
 * to copy a code out of a URL bar.
 */
async function authorize(argv: string[]): Promise<void> {
  const scopeGroups = parseScopeGroups(argv);

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.error('\nMissing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.\n');
    console.error('Set them in your shell, or create a .env.local containing:\n');
    console.error('  GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com');
    console.error('  GOOGLE_CLIENT_SECRET=xxxx\n');
    process.exit(1);
  }

  const url = buildConsentUrl({ redirectUri: REDIRECT_URI, scopeGroups });

  console.log('\n  Requesting scopes: ' + scopeGroups.join(', '));
  console.log('\n  Opening your browser to authorize.');
  console.log('  If it does not open, paste this URL:\n');
  console.log('  ' + url + '\n');
  console.log(`  Waiting for the redirect to ${REDIRECT_URI} ...\n`);

  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const requestUrl = new URL(req.url ?? '/', `http://localhost:${PORT}`);
      if (requestUrl.pathname !== '/oauth2callback') {
        res.writeHead(404).end();
        return;
      }

      const error = requestUrl.searchParams.get('error');
      const returnedCode = requestUrl.searchParams.get('code');

      if (error || !returnedCode) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(PAGE('Authorization failed', error ?? 'No code was returned.'));
        server.close();
        reject(new Error(error ?? 'No authorization code returned.'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(
        PAGE('Authorized', 'You can close this tab and return to your terminal.')
      );
      server.close();
      resolve(returnedCode);
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      reject(
        err.code === 'EADDRINUSE'
          ? new Error(`Port ${PORT} is already in use. Close whatever is using it and retry.`)
          : err
      );
    });

    server.listen(PORT, () => openBrowser(url));
  });

  const { refreshToken, scopes } = await exchangeCodeForTokens(code, {
    redirectUri: REDIRECT_URI,
  });

  console.log('  Success. Add this to your .env.local and to your host\'s');
  console.log('  environment variables (e.g. Vercel project settings):\n');
  console.log('  ' + '-'.repeat(64));
  console.log(`  GOOGLE_REFRESH_TOKEN=${refreshToken}`);
  console.log('  ' + '-'.repeat(64) + '\n');
  console.log('  Granted scopes:');
  for (const scope of scopes) console.log('    - ' + scope);
  console.log(
    '\n  Keep this token secret. It grants the access you just approved,\n' +
      '  and it does not expire unless you revoke it at\n' +
      '  https://myaccount.google.com/permissions\n'
  );
}

/** Confirm the stored credentials still work. */
async function verify(): Promise<void> {
  console.log('\n  Checking credentials...\n');
  const result = await verifyConnection();
  console.log('  Connection OK.');
  console.log(`  Access token valid for ~${result.expiresInSeconds}s (auto-renews).`);
  console.log('  Scopes on this token:');
  for (const scope of result.scopes) console.log('    - ' + scope);
  console.log('');
}

// --- entrypoint ------------------------------------------------------------

async function main(): Promise<void> {
  loadEnvFiles();

  const [command, ...argv] = process.argv.slice(2);

  switch (command) {
    case 'authorize':
      await authorize(argv);
      break;
    case 'verify':
      await verify();
      break;
    default:
      console.log(`
  google-connect

  Commands:
    authorize [--scopes A,B]   Run the one-time consent flow, print a refresh token
    verify                     Check that the stored credentials still work

  Scope groups:
    ${Object.keys(SCOPES).join(', ')}

  Default scopes: ${DEFAULT_SCOPE_GROUPS.join(', ')}
`);
  }
}

main().catch((error: Error) => {
  console.error('\n  Error: ' + error.message + '\n');
  process.exit(1);
});

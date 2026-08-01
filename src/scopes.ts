/**
 * Scope catalogue.
 *
 * Scopes are grouped by service so a project can request only what it needs.
 * The `authorize` CLI requests a set of these once; the resulting refresh token
 * is then valid for exactly those scopes forever (see README on publishing
 * status — a "Testing" app issues refresh tokens that die after 7 days).
 *
 * Note: Google Keep is deliberately absent. The Keep API is Workspace-
 * enterprise only and cannot be used with a personal @gmail.com account.
 * Use TASKS as the closest equivalent.
 */
export const SCOPES = {
  /** Read and write spreadsheets. */
  SHEETS: ['https://www.googleapis.com/auth/spreadsheets'],

  /** Read-only spreadsheets. */
  SHEETS_READONLY: ['https://www.googleapis.com/auth/spreadsheets.readonly'],

  /** Read and write calendar events. */
  CALENDAR: ['https://www.googleapis.com/auth/calendar'],

  /** Read-only calendar. */
  CALENDAR_READONLY: ['https://www.googleapis.com/auth/calendar.readonly'],

  /** Read and write task lists — the practical replacement for Keep. */
  TASKS: ['https://www.googleapis.com/auth/tasks'],

  /**
   * Send mail as the authorised user. Deliberately narrow: this scope cannot
   * read the inbox. Be aware that any Gmail scope causes Google to invalidate
   * refresh tokens when the account password changes.
   */
  GMAIL_SEND: ['https://www.googleapis.com/auth/gmail.send'],

  /** Files created by this app only — cannot see the rest of your Drive. */
  DRIVE_FILE: ['https://www.googleapis.com/auth/drive.file'],
} as const;

export type ScopeGroup = keyof typeof SCOPES;

/** Flatten one or more scope groups into the unique list Google expects. */
export function resolveScopes(groups: ScopeGroup[]): string[] {
  const flat = groups.flatMap((group) => {
    const scopes = SCOPES[group];
    if (!scopes) {
      throw new Error(
        `Unknown scope group "${group}". Valid groups: ${Object.keys(SCOPES).join(', ')}`
      );
    }
    return scopes as readonly string[];
  });
  return [...new Set(flat)];
}

/**
 * The scope set used by the `authorize` CLI when none is specified.
 * Covers every service this library wraps.
 */
export const DEFAULT_SCOPE_GROUPS: ScopeGroup[] = [
  'SHEETS',
  'CALENDAR',
  'TASKS',
  'GMAIL_SEND',
];

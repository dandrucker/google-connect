/**
 * google-connect
 *
 * Headless Google API access for personal projects. One refresh token, minted
 * once, reused by every app and every environment.
 *
 *   import { sheets } from 'google-connect';
 *   await sheets.appendRow(SHEET_ID, ['2026-08-01', 'Squats', '5x5']);
 */
export {
  getAuthClient,
  credentialsFromEnv,
  verifyConnection,
  buildConsentUrl,
  exchangeCodeForTokens,
  type AuthOptions,
  type GoogleCredentials,
} from './auth';

export { SCOPES, resolveScopes, DEFAULT_SCOPE_GROUPS, type ScopeGroup } from './scopes';

import * as sheets from './sheets';
import * as calendar from './calendar';
import * as tasks from './tasks';
import * as gmail from './gmail';

export { sheets, calendar, tasks, gmail };

// Also available as flat named imports for callers who prefer them.
export {
  appendRow,
  appendRows,
  readRange,
  ensureSheet,
  parseSpreadsheetId,
  type CellValue,
} from './sheets';
export { listEvents, listTodayEvents, createEvent, type NewEvent } from './calendar';
export { listTasks, addTask, completeTask, listTaskLists } from './tasks';
export { sendMail, type OutgoingMail } from './gmail';

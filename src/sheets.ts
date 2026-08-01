import { google } from 'googleapis';
import { getAuthClient, type AuthOptions } from './auth';

export type CellValue = string | number | boolean | null;

function sheetsApi(options: AuthOptions = {}) {
  return google.sheets({ version: 'v4', auth: getAuthClient(options) });
}

/**
 * Extract a spreadsheet id from either a bare id or a full browser URL, so
 * callers can paste whatever Google gave them.
 */
export function parseSpreadsheetId(idOrUrl: string): string {
  const match = idOrUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : idOrUrl.trim();
}

/**
 * Append one row to the bottom of a sheet.
 *
 * Uses USER_ENTERED so that values like dates and numbers are interpreted the
 * same way they would be if typed by hand, rather than landing as raw strings.
 */
export async function appendRow(
  spreadsheetId: string,
  values: CellValue[],
  options: AuthOptions & { sheetName?: string } = {}
): Promise<void> {
  await appendRows(spreadsheetId, [values], options);
}

export async function appendRows(
  spreadsheetId: string,
  rows: CellValue[][],
  options: AuthOptions & { sheetName?: string } = {}
): Promise<void> {
  const { sheetName = 'Sheet1', ...auth } = options;

  await sheetsApi(auth).spreadsheets.values.append({
    spreadsheetId: parseSpreadsheetId(spreadsheetId),
    range: `${sheetName}!A:A`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

export async function readRange(
  spreadsheetId: string,
  range: string,
  options: AuthOptions = {}
): Promise<string[][]> {
  const response = await sheetsApi(options).spreadsheets.values.get({
    spreadsheetId: parseSpreadsheetId(spreadsheetId),
    range,
  });
  return (response.data.values as string[][]) ?? [];
}

/**
 * Make a sheet safe to append to: create the tab if it is missing, and write
 * the header row if the sheet is empty.
 *
 * This exists so an app can point at a brand-new blank spreadsheet and simply
 * work, instead of requiring the user to lay out columns by hand.
 * Returns true if it had to initialise anything.
 */
export async function ensureSheet(
  spreadsheetId: string,
  sheetName: string,
  headers: string[],
  options: AuthOptions = {}
): Promise<boolean> {
  const id = parseSpreadsheetId(spreadsheetId);
  const api = sheetsApi(options);

  const meta = await api.spreadsheets.get({ spreadsheetId: id });
  const existing = meta.data.sheets?.some(
    (sheet) => sheet.properties?.title === sheetName
  );

  let initialised = false;

  if (!existing) {
    await api.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: {
        requests: [{ addSheet: { properties: { title: sheetName } } }],
      },
    });
    initialised = true;
  }

  const firstRow = await readRange(id, `${sheetName}!A1:Z1`, options);
  if (firstRow.length === 0 || firstRow[0].length === 0) {
    await api.spreadsheets.values.update({
      spreadsheetId: id,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });
    initialised = true;
  }

  return initialised;
}

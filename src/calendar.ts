import { google } from 'googleapis';
import type { calendar_v3 } from 'googleapis';
import { getAuthClient, type AuthOptions } from './auth';

function calendarApi(options: AuthOptions = {}) {
  return google.calendar({ version: 'v3', auth: getAuthClient(options) });
}

export interface EventWindow {
  from?: Date;
  to?: Date;
  calendarId?: string;
  maxResults?: number;
}

/**
 * List events in a time window, defaulting to the next 7 days.
 *
 * singleEvents expands recurring series into individual occurrences, which is
 * almost always what a caller wants when displaying a schedule.
 */
export async function listEvents(
  window: EventWindow & AuthOptions = {}
): Promise<calendar_v3.Schema$Event[]> {
  const {
    from = new Date(),
    to,
    calendarId = 'primary',
    maxResults = 50,
    ...auth
  } = window;

  const timeMax = to ?? new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);

  const response = await calendarApi(auth).events.list({
    calendarId,
    timeMin: from.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults,
  });

  return response.data.items ?? [];
}

/** Events occurring today, local time. */
export async function listTodayEvents(
  options: AuthOptions & { calendarId?: string } = {}
): Promise<calendar_v3.Schema$Event[]> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return listEvents({ from: start, to: end, ...options });
}

export interface NewEvent {
  summary: string;
  description?: string;
  start: Date;
  end: Date;
  location?: string;
  calendarId?: string;
}

export async function createEvent(
  event: NewEvent & AuthOptions
): Promise<calendar_v3.Schema$Event> {
  const {
    summary,
    description,
    start,
    end,
    location,
    calendarId = 'primary',
    ...auth
  } = event;

  const response = await calendarApi(auth).events.insert({
    calendarId,
    requestBody: {
      summary,
      description,
      location,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    },
  });

  return response.data;
}

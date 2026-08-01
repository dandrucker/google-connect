import { google } from 'googleapis';
import type { tasks_v1 } from 'googleapis';
import { getAuthClient, type AuthOptions } from './auth';

/**
 * Google Tasks — the practical stand-in for Google Keep, which has no API
 * available to personal accounts.
 */
function tasksApi(options: AuthOptions = {}) {
  return google.tasks({ version: 'v1', auth: getAuthClient(options) });
}

export async function listTaskLists(
  options: AuthOptions = {}
): Promise<tasks_v1.Schema$TaskList[]> {
  const response = await tasksApi(options).tasklists.list({ maxResults: 100 });
  return response.data.items ?? [];
}

/**
 * Resolve a task list by display name, falling back to the default list.
 * Callers generally think in names ("Groceries"), not opaque ids.
 */
export async function resolveTaskListId(
  name?: string,
  options: AuthOptions = {}
): Promise<string> {
  if (!name) return '@default';

  const lists = await listTaskLists(options);
  const match = lists.find(
    (list) => list.title?.toLowerCase() === name.toLowerCase()
  );

  if (!match?.id) {
    const available = lists.map((l) => l.title).filter(Boolean).join(', ');
    throw new Error(
      `Task list "${name}" not found. Available lists: ${available || '(none)'}`
    );
  }

  return match.id;
}

export async function listTasks(
  options: AuthOptions & { listName?: string; includeCompleted?: boolean } = {}
): Promise<tasks_v1.Schema$Task[]> {
  const { listName, includeCompleted = false, ...auth } = options;
  const tasklist = await resolveTaskListId(listName, auth);

  const response = await tasksApi(auth).tasks.list({
    tasklist,
    showCompleted: includeCompleted,
    showHidden: includeCompleted,
    maxResults: 100,
  });

  return response.data.items ?? [];
}

export async function addTask(
  title: string,
  options: AuthOptions & {
    listName?: string;
    notes?: string;
    due?: Date;
  } = {}
): Promise<tasks_v1.Schema$Task> {
  const { listName, notes, due, ...auth } = options;
  const tasklist = await resolveTaskListId(listName, auth);

  const response = await tasksApi(auth).tasks.insert({
    tasklist,
    requestBody: {
      title,
      notes,
      // The Tasks API only honours the date portion of due, not the time.
      due: due?.toISOString(),
    },
  });

  return response.data;
}

export async function completeTask(
  taskId: string,
  options: AuthOptions & { listName?: string } = {}
): Promise<void> {
  const { listName, ...auth } = options;
  const tasklist = await resolveTaskListId(listName, auth);

  await tasksApi(auth).tasks.patch({
    tasklist,
    task: taskId,
    requestBody: { status: 'completed' },
  });
}

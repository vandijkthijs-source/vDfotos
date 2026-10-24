import type { Connection, Progress } from '../features/sorting/types';
export async function syncProgress(connection: Connection, progress: Progress | undefined) {
  const url = new URL(connection.url);
  url.port = '2284'; url.pathname = '/sync'; url.search = ''; url.hash = '';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url.toString(), {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': connection.key },
      body: JSON.stringify({ completed: progress?.completed ?? {}, manualWeeks: progress?.manualWeeks ?? {}, resetWeeks: progress?.resetWeeks ?? {} }), signal: controller.signal,
    });
    if (!response.ok) throw new Error('Progress sync failed. Check the laptop connection and API key.');
    const result = await response.json() as { userId: string; completed: Progress['completed']; manualWeeks: Record<string, boolean>; resetWeeks?: Record<string, number> };
    if (result.userId !== connection.userId || !result.completed || !result.manualWeeks) throw new Error('Unexpected progress-sync response.');
    return result;
  } finally { clearTimeout(timeout); }
}

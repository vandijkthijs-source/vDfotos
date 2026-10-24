const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', avif: 'image/avif',
  tif: 'image/tiff', tiff: 'image/tiff', mp4: 'video/mp4', mov: 'video/quicktime',
  m4v: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska',
};
export function shareMime(filename: string, contentType?: string) {
  const mime = contentType?.split(';')[0].trim().toLowerCase();
  return mime && mime !== 'application/octet-stream' ? mime : MIME[filename.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
}
export function expiredExport(name: string, now = Date.now()) {
  const match = /^photo-export-(\d+)\/$/.exec(name.endsWith('/') ? name : name + '/');
  return !!match && now - Number(match[1]) > 24 * 60 * 60 * 1000;
}
export async function downloadForSharing<T>(task: { downloadAsync(): Promise<T>; pauseAsync(): Promise<unknown> }, timeoutMs = 120000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task.downloadAsync(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => {
        // Reject independently: a stalled native transfer must not lock the toolbar.
        reject(new Error('Photo download timed out. Check Wi-Fi and try sharing again.'));
        void task.pauseAsync().catch(() => {});
      }, timeoutMs); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

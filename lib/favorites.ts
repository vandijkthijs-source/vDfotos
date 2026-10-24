import type { Album, Asset } from '../features/sorting/types';
import { ImmichClient } from './immich';

const queues = new Map<string, Promise<unknown>>();
async function serialized<T>(api: ImmichClient, work: () => Promise<T>): Promise<T> {
  const key = `${api.connection.url}|${api.connection.userId}`;
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(work);
  queues.set(key, next);
  try { return await next; }
  finally { if (queues.get(key) === next) queues.delete(key); }
}
async function findAlbum(api: ImmichClient, create: boolean): Promise<Album | undefined> {
  const albums = await api.albums();
  const existing = albums.find(album => album.albumName.trim().toLowerCase() === 'favorites');
  if (existing) return existing;
  const legacy = albums.find(album => album.albumName.trim().toLowerCase() === 'favorit');
  if (legacy) {
    await api.renameAlbum(legacy.id, 'Favorites');
    return { ...legacy, albumName: 'Favorites' };
  }
  return create ? await api.createAlbum('Favorites') : undefined;
}
async function collect(api: ImmichClient, options: { albumId?: string; isFavorite?: boolean }) {
  const items = new Map<string, Asset>(), seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await api.browse({ ...options, cursor });
    for (const item of page.items) items.set(item.id, item);
    cursor = page.nextCursor ?? undefined;
    if (cursor && seen.has(cursor)) throw new Error('Immich repeated a page. Retry syncing Favorites.');
    if (cursor) seen.add(cursor);
  } while (cursor);
  return [...items.values()];
}
async function remove(api: ImmichClient, albumId: string, ids: string[]) {
  // This only removes album membership; it never trashes or deletes a photo.
  const result = await api.request<{ id: string; success: boolean; error?: string }[]>(`/albums/${encodeURIComponent(albumId)}/assets`, 'DELETE', { ids });
  if (ids.some(id => !result.some(item => item.id === id && (item.success || item.error === 'not_found')))) throw new Error('Could not update Favorites. Retry this action.');
}
export async function setPhotoFavorite(api: ImmichClient, id: string, value: boolean) {
  return serialized(api, async () => {
    const album = await findAlbum(api, value);
    // Update membership first so a successful heart toggle always has a matching album.
    if (album) {
      if (value) await api.addToAlbum(album.id, [id]);
      else await remove(api, album.id, [id]);
    }
    await api.favorite(id, value);
  });
}
export async function syncFavoritesAlbum(api: ImmichClient): Promise<Album[]> {
  return serialized(api, async () => {
    const favorites = await collect(api, { isFavorite: true });
    const album = await findAlbum(api, true);
    if (!album) throw new Error('Could not create Favorites.');
    const members = await collect(api, { albumId: album.id });
    const memberIds = new Set(members.map(item => item.id)), favoriteIds = new Set(favorites.map(item => item.id));
    const added = favorites.filter(item => !memberIds.has(item.id)).map(item => item.id);
    const removed = members.filter(item => !favoriteIds.has(item.id)).map(item => item.id);
    for (let i = 0; i < added.length; i += 100) await api.addToAlbum(album.id, added.slice(i, i + 100));
    for (let i = 0; i < removed.length; i += 100) await remove(api, album.id, removed.slice(i, i + 100));
    return api.albums();
  });
}

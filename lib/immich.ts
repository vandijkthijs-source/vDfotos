import { monthBounds } from '../features/sorting/period';
import type { Album, Asset, Connection } from '../features/sorting/types';
import { weekBounds } from '../features/sorting/week';

export function normalizeUrl(input: string) {
  const url = new URL(input.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Enter the server address only, such as http://192.168.1.20:2283.');
  }
  return url.toString().replace(/\/+$/, '').replace(/\/api$/, '');
}
type Fetch = typeof fetch;
export class ImmichClient {
  constructor(readonly connection: Connection, private fetcher: Fetch = fetch) {}
  async request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await this.fetcher(`${this.connection.url}/api${path}`, {
        method, headers: { 'x-api-key': this.connection.key, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal,
      });
      if (!response.ok) {
        if (response.status === 401) throw new Error('Your API key was not accepted. Reconnect in Settings.');
        if (response.status === 403) throw new Error('This API key lacks permission for this action. Check its permissions in Immich.');
        throw new Error(`Immich could not finish this request (${response.status}). Your pending decisions are saved.`);
      }
      if (response.status === 204) return undefined as T;
      return await response.json() as T;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new Error('The server took too long. Check Wi-Fi and whether the laptop is awake, then retry.');
      if (error instanceof TypeError) throw new Error('Cannot reach Immich. Check the server address, Wi-Fi and that the laptop is awake.');
      throw error;
    } finally { clearTimeout(timer); }
  }
  me() { return this.request<{ id: string; name: string }>('/users/me'); }
  albums() { return this.request<Album[]>('/albums?isOwned=true'); }
  renameAlbum(id: string, albumName: string) {
    if (!albumName.trim()) throw new Error('Enter an album name.');
    return this.request<Album>(`/albums/${encodeURIComponent(id)}`, 'PATCH', { albumName: albumName.trim() });
  }
  async addToAlbum(albumId: string, ids: string[]) {
    const results = await this.request<{ id: string; success: boolean; error?: string }[]>(`/albums/${encodeURIComponent(albumId)}/assets`, 'PUT', { ids });
    if (ids.some(id => !results.some(result => result.id === id && (result.success || result.error === 'duplicate')))) throw new Error('Some photos could not be added. Retry to finish adding them.');
  }
  async smartSearch(query: string, page = '1') {
    // Immich 3.3.5's filter-based smart search has no pagination. Its supported
    // legacy request shape returns nextPage and keeps relevance ordering.
    const result = await this.request<{ assets: { items: Asset[]; nextPage: string | null } }>('/search/smart', 'POST', {
      query, size: 100, page: Number(page), visibility: 'timeline',
    });
    if (result.assets.nextPage === undefined) throw new Error('This server does not provide paginated smart search.');
    return { items: result.assets.items.filter(a => a.ownerId === this.connection.userId && !a.isTrashed && ['IMAGE', 'VIDEO'].includes(a.type)), nextCursor: result.assets.nextPage };
  }
  async people() {
    const people: { id: string; name: string }[] = [];
    let page = 1;
    while (true) {
      const result = await this.request<{ people: { id: string; name: string }[]; hasNextPage?: boolean }>(`/people?withHidden=false&size=500&page=${page}`);
      people.push(...result.people);
      if (!result.hasNextPage) return people;
      page++;
    }
  }
  cities() { return this.request<Asset[]>('/search/cities'); }
  async browse(options: { cursor?: string; albumId?: string; query?: string; personId?: string; city?: string; isFavorite?: boolean } = {}) {
    const result = await this.request<{ assets: { items: Asset[]; nextCursor: string | null } }>('/search/metadata', 'POST', {
      size: 90, cursor: options.cursor, orderBy: { field: 'fileCreatedAt', direction: 'desc' },
      filter: {
        trashedAt: { eq: null }, visibility: { eq: 'timeline' },
        ...(options.albumId ? { albumIds: { any: [options.albumId] } } : {}),
        ...(options.personId ? { personIds: { any: [options.personId] } } : {}),
        ...(options.isFavorite !== undefined ? { isFavorite: { eq: options.isFavorite } } : {}),
        ...(options.city ? { city: { eq: options.city } } : {}),
        ...(options.query ? { originalFileName: { like: `%${options.query}%` } } : {}),
      },
    });
    if (!Array.isArray(result.assets?.items) || result.assets.nextCursor === undefined) throw new Error('Unsupported photo response.');
    return { items: result.assets.items.filter(a => a.ownerId === this.connection.userId && !a.isTrashed && ['IMAGE', 'VIDEO'].includes(a.type)), nextCursor: result.assets.nextCursor };
  }
  createAlbum(albumName: string) { return this.request<Album>('/albums', 'POST', { albumName }); }
  week(week: string, signal?: AbortSignal) { return this.dateRange(weekBounds(week), signal); }
  month(month: string, signal?: AbortSignal) { return this.dateRange(monthBounds(month), signal); }
  private async dateRange({ start, end }: { start: string; end: string }, signal?: AbortSignal) {
    const assets = new Map<string, Asset>();
    let cursor: string | undefined;
    const seen = new Set<string>();
    do {
      if (signal?.aborted) throw new Error('Loading cancelled.');
      const data = await this.request<{ assets: { items: Asset[]; nextCursor: string | null } }>('/search/metadata', 'POST', {
        size: 500, cursor, withExif: true,
        filter: { takenAt: { gte: start, lt: end }, trashedAt: { eq: null }, visibility: { eq: 'timeline' } },
      });
      if (!data.assets || !Array.isArray(data.assets.items) || data.assets.nextCursor === undefined) {
        throw new Error('Unsupported server response. Immich Sort currently supports Immich 3.3.5.');
      }
      for (const asset of data.assets.items) {
        if (asset.ownerId === this.connection.userId && !asset.isTrashed && ['IMAGE', 'VIDEO'].includes(asset.type)) {
          // Persist only what sorting needs, rather than entire EXIF/face records.
          assets.set(asset.id, {
            id: asset.id, ownerId: asset.ownerId, type: asset.type,
            originalFileName: asset.originalFileName, fileCreatedAt: asset.fileCreatedAt,
            localDateTime: asset.localDateTime, isTrashed: asset.isTrashed,
            visibility: asset.visibility, duration: asset.duration,
          });
        }
      }
      cursor = data.assets.nextCursor ?? undefined;
      if (cursor && seen.has(cursor)) throw new Error('Immich repeated a page. Retry loading this period.');
      if (cursor) seen.add(cursor);
    } while (cursor);
    return [...assets.values()].sort((a, b) => a.fileCreatedAt.localeCompare(b.fileCreatedAt) || a.id.localeCompare(b.id));
  }
  media(asset: Asset, video = false, size: 'preview' | 'thumbnail' = 'preview') {
    return { uri: `${this.connection.url}/api/assets/${encodeURIComponent(asset.id)}/${video ? 'video/playback' : `thumbnail?size=${size}`}`, headers: { 'x-api-key': this.connection.key } };
  }
  async favorite(id: string, isFavorite: boolean) {
    return this.request<Asset>(`/assets/${encodeURIComponent(id)}`, 'PUT', { isFavorite });
  }
  personThumbnail(id: string) {
    return { uri: `${this.connection.url}/api/people/${encodeURIComponent(id)}/thumbnail`, headers: { 'x-api-key': this.connection.key } };
  }
  async namePerson(id: string, name: string) {
    if (!name.trim()) throw new Error('Enter a name first.');
    return this.request<{ id: string; name: string }>(`/people/${encodeURIComponent(id)}`, 'PUT', { name: name.trim() });
  }
  async keep(assetId: string, albumId: string) {
    const result = await this.request<{ id: string; success: boolean; error?: string }[]>(`/albums/${encodeURIComponent(albumId)}/assets`, 'PUT', { ids: [assetId] });
    const item = result.find(r => r.id === assetId);
    if (!item || (!item.success && item.error !== 'duplicate')) throw new Error('Could not add this photo to its album. Your decision is saved for retry.');
  }
  async trashInfo() {
    const [features, config] = await Promise.all([
      this.request<{ trash: boolean }>('/server/features'),
      this.request<{ trashDays: number }>('/server/config'),
    ]);
    if (features.trash !== true || !Number.isFinite(config.trashDays) || config.trashDays < 1) {
      throw new Error('Trash is disabled or its retention could not be verified. Enable Trash in Immich before applying delete decisions.');
    }
    return config.trashDays;
  }
  async trash(asset: Asset) {
    // Repeat this check before every deletion; never expose permanent deletion.
    await this.trashInfo();
    const current = await this.request<Asset>(`/assets/${encodeURIComponent(asset.id)}`);
    if (current.ownerId !== this.connection.userId) throw new Error('You can only trash your own photos.');
    if (current.isTrashed) return;
    await this.request<void>('/assets', 'DELETE', { ids: [asset.id], force: false });
  }
}

import type { Album } from './types';
export function moveAlbum<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) return items;
  const result = [...items]; const [item] = result.splice(from, 1); result.splice(to, 0, item); return result;
}
export function orderAlbums(albums: Album[], ids: string[]): Album[] {
  const rank = new Map(ids.map((id, index) => [id, index]));
  return [...albums].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
}

import type { Asset } from './types';
export type GalleryRow = { key: string; title: string; photos?: never } | { key: string; photos: Asset[]; title?: never };
export function galleryRows(photos: Asset[], dated: boolean): GalleryRow[] {
  const rows: GalleryRow[] = [];
  const ordered = dated ? [...photos].sort((a, b) => b.fileCreatedAt.localeCompare(a.fileCreatedAt)) : photos;
  let day = '', batch: Asset[] = [];
  const flush = () => { if (batch.length) rows.push({ key: `photos-${batch[0].id}`, photos: batch }); batch = []; };
  for (const photo of ordered) {
    const date = new Date(photo.fileCreatedAt);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    if (dated && key !== day) {
      flush(); day = key;
      rows.push({ key: `date-${key}`, title: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) });
    }
    batch.push(photo);
    if (batch.length === 3) flush();
  }
  flush(); return rows;
}

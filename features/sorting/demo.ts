import type { Album, Asset } from './types';
import { inPeriod, monthStart } from './period';
import { monday, shiftWeek, parseDay } from './week';
export const demoAlbums: Album[] = [
  { id: 'family', albumName: 'Family & friends', assetCount: 24 },
  { id: 'adventures', albumName: 'Little adventures', assetCount: 18 },
  { id: 'everyday', albumName: 'Everyday moments', assetCount: 42 },
];
export function demoAssets(week: string): Asset[] {
  const names = ['A slow Sunday', 'Along the coast', 'Coffee with friends', 'A little adventure', 'Evening light', 'The good days'];
  const palette = ['#577b71', '#527985', '#a88263', '#657255', '#9d7265', '#686d8b'];
  return names.map((name, i) => {
    const date = parseDay(week); date.setDate(date.getDate() + i); date.setHours(10 + i);
    return { id: `demo-${week}-${i}`, ownerId: 'demo', originalFileName: name,
      type: 'IMAGE', localDateTime: date.toISOString(), fileCreatedAt: date.toISOString(), demoColor: palette[i] };
  });
}

export function demoMonth(month: string): Asset[] {
  const first = monday(parseDay(month));
  return Array.from({ length: 6 }, (_, index) => demoAssets(shiftWeek(first, index))).flat().filter(asset => inPeriod(asset, monthStart(parseDay(month)), 'months'));
}

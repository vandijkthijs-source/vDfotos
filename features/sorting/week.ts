const pad = (n: number) => String(n).padStart(2, '0');
export function dayKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
export function parseDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Use a date like 2026-10-19.');
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12);
  if (dayKey(date) !== value) throw new Error('That date does not exist.');
  return date;
}
export function monday(value = new Date()) {
  const date = new Date(value);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return dayKey(date);
}
export function shiftWeek(week: string, amount: number) {
  const d = parseDay(week); d.setDate(d.getDate() + amount * 7); return dayKey(d);
}
export function weekBounds(week: string) {
  const start = parseDay(week); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 7);
  return { start: start.toISOString(), end: end.toISOString() };
}
export function weekLabel(week: string) {
  const start = parseDay(week), end = new Date(start); end.setDate(end.getDate() + 6);
  return `${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

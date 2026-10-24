// A pinch or a pan on a zoomed photo must never change the selected photo.
export function photoSwipe(dx: number, dy: number, scale: number, multiTouch: boolean): -1 | 0 | 1 {
  if (multiTouch || scale > 1.01 || Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.4) return 0;
  return dx < 0 ? 1 : -1;
}

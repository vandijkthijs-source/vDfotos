// Capture the decision before an animation: React Native reuses gesture state.
export function captureSwipe(dx: number, onDecision: (kind: 'keep' | 'trash') => void) {
  const kind = dx > 0 ? 'keep' : 'trash';
  return () => onDecision(kind);
}

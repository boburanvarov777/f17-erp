/** Quick-pick quantities as fractions of a daily norm (25% … 100%). */
export function planQtySuggestions(target: number): number[] {
  if (target <= 0) return [50, 100, 250, 500];
  const raw = [0.25, 0.5, 0.75, 1].map((p) => Math.round(target * p));
  return [...new Set(raw.filter((n) => n > 0))];
}

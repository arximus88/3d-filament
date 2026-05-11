// Ukrainian-friendly relative-time label for "last updated" lines.
//   today                → "оновлено сьогодні"
//   yesterday            → "оновлено вчора"
//   2-6 days ago         → "оновлено N дн тому"
//   ≥7 days ago          → "оновлено N тиж тому"
//   invalid / missing    → "дані ще не зібрано"
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return 'дані ще не зібрано';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return 'дані ще не зібрано';

  const now = new Date();
  const thenDay = then.toDateString();
  const todayDay = now.toDateString();
  if (thenDay === todayDay) return 'оновлено сьогодні';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (thenDay === yesterday.toDateString()) return 'оновлено вчора';

  const days = Math.round((now.getTime() - then.getTime()) / 86_400_000);
  if (days < 7) return `оновлено ${days} дн тому`;
  const weeks = Math.round(days / 7);
  return `оновлено ${weeks} тиж тому`;
}

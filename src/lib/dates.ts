// Utility functions for dynamic dates across Propithub

export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getNextMonthFirstDateString(): string {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const year = nextMonth.getFullYear();
  const month = String(nextMonth.getMonth() + 1).padStart(2, '0');
  const day = '01';
  return `${year}-${month}-${day}`;
}

export function getOneYearLaterDateString(startDateString?: string): string {
  const base = startDateString ? new Date(startDateString) : new Date();
  const nextYear = new Date(base.getFullYear() + 1, base.getMonth(), base.getDate() - 1);
  const year = nextYear.getFullYear();
  const month = String(nextYear.getMonth() + 1).padStart(2, '0');
  const day = String(nextYear.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getDaysFromNowString(days: number): string {
  const target = new Date(Date.now() + days * 86400000);
  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, '0');
  const day = String(target.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats a day of month or integer with proper English ordinal suffix (1st, 2nd, 3rd, 4th, 11th, 21st, etc.).
 */
export function formatOrdinalDay(n: number | string | undefined | null): string {
  const num = parseInt(String(n || 1), 10);
  if (isNaN(num)) return String(n || '1st');
  const j = num % 10;
  const k = num % 100;
  if (j === 1 && k !== 11) {
    return `${num}st`;
  }
  if (j === 2 && k !== 12) {
    return `${num}nd`;
  }
  if (j === 3 && k !== 13) {
    return `${num}rd`;
  }
  return `${num}th`;
}


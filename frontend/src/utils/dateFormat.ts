/**
 * Format an ISO date string (yyyy-mm-dd or full ISO) according to the
 * date_format stored in localStorage (set by SettingsProvider).
 *
 * Supported formats: DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY, MM/DD/YYYY, YYYY-MM-DD
 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';

  // Extract yyyy-mm-dd from an ISO string (may include time portion)
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return dateStr;

  const [, yyyy, mm, dd] = match;
  const fmt = localStorage.getItem('bk_date_format') || 'DD-MM-YYYY';

  switch (fmt) {
    case 'DD-MM-YYYY':
      return `${dd}-${mm}-${yyyy}`;
    case 'DD/MM/YYYY':
      return `${dd}/${mm}/${yyyy}`;
    case 'DD.MM.YYYY':
      return `${dd}.${mm}.${yyyy}`;
    case 'MM/DD/YYYY':
      return `${mm}/${dd}/${yyyy}`;
    case 'YYYY-MM-DD':
      return `${yyyy}-${mm}-${dd}`;
    default:
      return `${dd}-${mm}-${yyyy}`;
  }
}

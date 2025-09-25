export const formatDate = (date: Date | string | null): string => {
  if (!date) return '—';
  let d: Date;
  if (typeof date === 'string') {
    d = new Date(date);
    if (isNaN(d.getTime())) return '—';
  } else {
    d = date;
    if (isNaN(d.getTime())) return '—';
  }
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
};

export const DEFAULT_TIME_ZONE = 'Africa/Nairobi';
export const TIME_ZONE_PREFERENCE_CHANGED_EVENT = 'riana-timezone-preference-changed';

export const resolveTimeZone = (timeZone?: string | null) => {
  const candidate = String(timeZone || '').trim() || DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: candidate }).format();
    return candidate;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
};

export const getZonedHour = (date: Date, timeZone = DEFAULT_TIME_ZONE) => {
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: resolveTimeZone(timeZone), hour: '2-digit', hourCycle: 'h23' });
  const parts = formatter.formatToParts(date);
  return Number(parts.find(part => part.type === 'hour')?.value || 0);
};

export const getGreeting = (date = new Date(), timeZone = DEFAULT_TIME_ZONE) => {
  const hour = getZonedHour(date, timeZone);
  if (hour >= 4 && hour < 12) return 'Good morning!';
  if (hour >= 12 && hour < 17) return 'Good afternoon!';
  if (hour >= 17 && hour < 21) return 'Good evening!';
  return 'Good night!';
};

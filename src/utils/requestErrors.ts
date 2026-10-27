export function friendlyRequestError(status: number, payload: unknown): string {
  const data = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const candidate = typeof data.error === 'string' ? data.error : typeof data.message === 'string' ? data.message : '';
  const unsafe = /SQLSTATE|ER_[A-Z_]+|SELECT\s.+FROM|INSERT\s+INTO|stack trace|node_modules|ECONNREFUSED|<html|<!doctype/i.test(candidate);
  if (status >= 500 && data.code !== 'MAINTENANCE_MODE')
    return 'The service is temporarily unavailable. Please try again shortly. If this continues, contact your administrator.';
  if (candidate && candidate.length <= 1000 && !unsafe) return candidate;
  if (status === 401) return 'Please sign in again to continue.';
  if (status === 403) return 'You do not have permission to do this. Contact your administrator if you need access.';
  if (status === 404) return 'This item could not be found. Refresh the page and try again.';
  if (status === 409) return 'This item has changed or is already in use. Refresh and check its current details before trying again.';
  if (status === 429) return 'Too many requests. Please wait a moment before trying again.';
  return 'We could not complete your request. Check the details and try again.';
}

export const connectionErrorMessage = 'Unable to connect to the server. Check your connection and try again. If you just submitted a change, refresh to check whether it was saved before submitting again.';

const BUSINESS_SCOPE_KEY = 'riana-business-subsidiary';
const BUSINESS_SCOPE_HEADER = 'X-CIMS-Business-Subsidiary';

export function getBusinessScope() {
  return sessionStorage.getItem(BUSINESS_SCOPE_KEY) || '';
}

export function setBusinessScope(subsidiaryId: string) {
  if (subsidiaryId) sessionStorage.setItem(BUSINESS_SCOPE_KEY, subsidiaryId);
  else sessionStorage.removeItem(BUSINESS_SCOPE_KEY);
}

export function applyBusinessScope(headers: Headers) {
  const scope = getBusinessScope();
  if (scope) headers.set(BUSINESS_SCOPE_HEADER, scope);
}

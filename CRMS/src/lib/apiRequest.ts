import { friendlyRequestError, connectionErrorMessage } from '../../../src/utils/requestErrors';

export async function apiRequest(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await window.fetch(input, init).catch(() => { throw new Error(connectionErrorMessage); });
  if (!response.ok) {
    const payload = await response.clone().json().catch(() => ({}));
    throw new Error(friendlyRequestError(response.status, payload));
  }
  return response;
}

import { friendlyRequestError, connectionErrorMessage } from '../../../src/utils/requestErrors';

export class ApiRequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
}

export async function apiRequest(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await window.fetch(input, init).catch(() => { throw new Error(connectionErrorMessage); });
  if (!response.ok) {
    const payload = await response.clone().json().catch(() => ({}));
    throw new ApiRequestError(response.status, friendlyRequestError(response.status, payload));
  }
  return response;
}

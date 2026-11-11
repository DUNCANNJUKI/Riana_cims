import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); vi.resetModules(); });

test('authenticated fetch attaches the session only to exact same-origin CRMS API paths', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('{}'));
  vi.stubGlobal('fetch', fetch);
  localStorage.setItem('riana-auth-token', 'test-session');
  const { installAuthenticatedFetch } = await import('./authenticatedFetch');
  installAuthenticatedFetch();
  await window.fetch('/api/crms/change_requests');
  expect(new Headers(fetch.mock.calls[0][1].headers).get('Authorization')).toBe('Bearer test-session');
  for (const url of ['https://outside.invalid/api/crms/change_requests', '/other?redirect=/api/crms', '/api/crms-other']) {
    await window.fetch(url);
    expect(fetch.mock.calls[fetch.mock.calls.length - 1]?.[1]).toEqual({});
  }
});

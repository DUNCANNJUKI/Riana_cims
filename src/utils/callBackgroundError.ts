export class CallBackgroundError extends Error {
  readonly code: 'WASM_UNAVAILABLE';
  constructor(code: 'WASM_UNAVAILABLE') {
    super('Background effects need WebAssembly, which is unavailable on this page. Your camera is still available. Contact your administrator to check browser support and the site security policy.');
    this.name = 'CallBackgroundError';
    this.code = code;
  }
}

export function callBackgroundErrorMessage(error: unknown): string {
  if (error instanceof CallBackgroundError) return error.message;
  // Asset/compiler failures can also mention WebAssembly; do not misdiagnose them as browser settings.
  return 'The background effect could not load. Your camera is still available. Try again or contact your administrator.';
}

export interface ErrorDetails {
  message?: string;
  name?: string;
  response?: { data?: { error?: string } };
}

const record = (value: unknown): Record<string, unknown> =>
  value !== null && (typeof value === 'object' || typeof value === 'function')
    ? value as Record<string, unknown> : {};

/** Read optional diagnostic fields without assuming a thrown value is an Error. */
export const errorDetails = (value: unknown): ErrorDetails => {
  const source = record(value);
  const response = record(source.response);
  const data = record(response.data);
  return {
    message: typeof source.message === 'string' ? source.message : undefined,
    name: typeof source.name === 'string' ? source.name : undefined,
    response: typeof data.error === 'string' ? { data: { error: data.error } } : undefined,
  };
};

const DEVICE_STORAGE_KEY = 'riana.communication.device-id';

export const getCommunicationDeviceId = () => {
  const existing = window.localStorage.getItem(DEVICE_STORAGE_KEY);
  if (existing && /^[A-Za-z0-9._:-]{16,80}$/.test(existing)) return existing;
  const generated = `web:${crypto.randomUUID()}`;
  window.localStorage.setItem(DEVICE_STORAGE_KEY, generated);
  return generated;
};

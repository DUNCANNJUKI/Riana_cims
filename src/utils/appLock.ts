export const REQUEST_APP_LOCK_EVENT = "riana-request-app-lock";
export const APP_LOCK_STATE_KEY = "riana-app-lock-state";

export const requestAppLock = (reason: "manual" | "inactivity" | "resume" = "manual") => {
  window.dispatchEvent(new CustomEvent(REQUEST_APP_LOCK_EVENT, { detail: { reason } }));
};

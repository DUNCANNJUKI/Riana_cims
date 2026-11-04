export interface MissedCallStateItem {
  id: string;
  message_kind?: string;
  call_status?: string;
}

export const filterDismissedMissedCalls = <T extends MissedCallStateItem>(
  calls: T[],
  dismissedIds: ReadonlySet<string>,
) => calls.filter(call => call.message_kind === 'call'
  && call.call_status === 'missed'
  && !dismissedIds.has(String(call.id)));

export const mergeUndismissedMissedCalls = <T extends MissedCallStateItem>(
  current: T[],
  incoming: T[],
  dismissedIds: ReadonlySet<string>,
) => {
  const next = filterDismissedMissedCalls(current, dismissedIds);
  filterDismissedMissedCalls(incoming, dismissedIds).forEach(call => {
    const existing = next.findIndex(item => item.id === call.id);
    if (existing >= 0) next[existing] = { ...next[existing], ...call };
    else next.unshift(call);
  });
  return next.slice(0, 10);
};

export const persistThenDismissMissedCall = async (
  persist: () => Promise<unknown>,
  commitDismissal: () => void,
) => {
  await persist();
  commitDismissal();
};

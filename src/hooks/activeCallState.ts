export interface ActiveCallStateItem {
  id: string;
  sender_id: string;
  call_status?: string | null;
  call_participants?: Array<{ user_id: string; status: string }>;
}

const terminalStatuses = new Set(['declined', 'ended', 'missed', 'cancelled', 'expired', 'failed']);

export const isPendingCallInvitation = (call: ActiveCallStateItem, currentUserId: string): boolean => {
  const ownStatus = call.call_participants?.find(participant => String(participant.user_id) === String(currentUserId))?.status;
  return !terminalStatuses.has(String(call.call_status))
    && ['invited', 'ringing'].includes(String(ownStatus))
    && String(call.sender_id) !== String(currentUserId);
};

export const clearMatchingActiveCall = <T extends { id: string }>(current: T | null, callId: string): T | null =>
  current?.id === callId ? null : current;

export const activeCallAfterUpdate = <T extends ActiveCallStateItem>(
  current: T | null,
  update: T,
  currentUserId: string,
  resolvedOnAnotherDevice = false,
): T | null => {
  const ownStatus = update.call_participants?.find(participant => String(participant.user_id) === String(currentUserId))?.status;
  if (resolvedOnAnotherDevice || terminalStatuses.has(String(update.call_status)) || terminalStatuses.has(String(ownStatus))) {
    return clearMatchingActiveCall(current, update.id);
  }
  // Broadcast snapshots are account-scoped. Only an explicit answer, start,
  // or device-scoped restore can activate media on this device.
  if (current?.id !== update.id) return current;
  return isPendingCallInvitation(update, currentUserId) ? current : update;
};

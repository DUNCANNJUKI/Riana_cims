const endCallMemberships = async (connection, callId, actorId = null) => {
  await connection.query(
    "UPDATE call_participants SET status='ended',left_at=COALESCE(left_at,NOW()) WHERE call_id=? AND status IN ('accepted','invited','ringing')",
    [callId],
  );
  await connection.query(
    "UPDATE call_device_sessions SET status=IF(status='accepted','disconnected','canceled'),resolved_at=UTC_TIMESTAMP() WHERE call_id=? AND status IN ('accepted','ringing')",
    [callId],
  );
  for (const [sql, params] of [
    ['UPDATE call_participants SET hand_raised=FALSE,hand_raised_at=NULL,screen_sharing=FALSE WHERE call_id=?', [callId]],
    ['UPDATE call_meeting_state SET spotlight_user_id=NULL,recording_active=FALSE,recording_id=NULL,updated_by=? WHERE call_id=?', [actorId, callId]],
  ]) {
    await connection.query(sql, params).catch(error => {
      if (!['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error?.code)) throw error;
    });
  }
};

const closeAbandonedMeeting = async (pool, callId, graceSeconds) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[call]] = await connection.query(
      "SELECT call_status FROM messages WHERE id=? AND message_kind='call' FOR UPDATE",
      [callId],
    );
    if (call?.call_status !== 'accepted') {
      await connection.rollback();
      return false;
    }
    // Serialize with a concurrent heartbeat before making the final decision.
    const [devices] = await connection.query(
      `SELECT user_id, meeting_heartbeat_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? SECOND) AS stale
       FROM call_device_sessions WHERE call_id=? AND status='accepted' FOR UPDATE`,
      [graceSeconds, callId],
    );
    const [members] = await connection.query("SELECT user_id FROM call_participants WHERE call_id=? AND status='accepted'", [callId]);
    const trackedUsers = new Set(devices.map(device => device.user_id));
    if (!devices.length || devices.some(device => Number(device.stale) !== 1) ||
        !members.length || members.some(member => !trackedUsers.has(member.user_id))) {
      await connection.rollback();
      return false;
    }
    await connection.query("UPDATE messages SET call_status='ended',call_ended_at=COALESCE(call_ended_at,NOW()) WHERE id=?", [callId]);
    await endCallMemberships(connection, callId);
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
};

const sweepAbandonedMeetings = async (pool, graceSeconds, onClosed) => {
  const [candidates] = await pool.query(
    `SELECT cd.call_id FROM call_device_sessions cd INNER JOIN messages m ON m.id=cd.call_id
     WHERE cd.status='accepted' AND m.call_status='accepted'
       AND cd.meeting_heartbeat_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? SECOND)
     GROUP BY cd.call_id HAVING NOT EXISTS (
       SELECT 1 FROM call_device_sessions live
       WHERE live.call_id=cd.call_id AND live.status='accepted'
         AND (live.meeting_heartbeat_at IS NULL OR live.meeting_heartbeat_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? SECOND))
     ) LIMIT 30`,
    [graceSeconds, graceSeconds],
  );
  for (const { call_id: callId } of candidates) {
    if (await closeAbandonedMeeting(pool, callId, graceSeconds)) await onClosed(callId);
  }
};

module.exports = { endCallMemberships, closeAbandonedMeeting, sweepAbandonedMeetings };

const BUSINESS_ROLE = 'HeadOfBusiness';
const BUSINESS_SCOPE_HEADER = 'x-cims-business-subsidiary';

const businessReadRoutes = [
  /^\/business\/(?:overview|activity|requests(?:\/[^/]+)?)$/,
  /^\/business\/scopes$/,
  /^\/crms\/change_requests\/[^/]+\/completion\.pdf$/,
  /^\/clients(?:\/[^/]+(?:\/(?:branches|departments))?)?$/,
  /^\/branches\/[^/]+\/departments$/,
  /^\/(?:installations|client_assignments|subsidiaries)(?:\/[^/]+)?$/,
  /^\/departments$/,
  /^\/user_profiles$/,
  /^\/installation_feedback(?:\/latest)?$/,
  /^\/(?:handover_uploads|download)$/,
  /^\/budgets$/,
  /^\/hardware\/(?:catalog|equipment-requirements|assets(?:\/[^/]+(?:\/components)?)?|summary|alerts|movements|installations\/[^/]+|reports|export)$/,
  /^\/scheduling\/(?:events(?:\/[^/]+\/history)?|catalog)$/,
  /^\/announcements$/,
  /^\/announcement_reads\/[^/]+$/,
  /^\/chat\/(?:users|stream|saved-messages|missed-calls|messages\/[^/]+|attachments\/[^/]+|scheduled-meetings|calls\/(?:active|ice-servers))$/,
];

const personalRoutes = [
  /^\/auth(?:\/|$)/,
  /^\/notifications(?:\/|$)/,
  /^\/communication\/(?:preferences(?:\/theme)?|push-configuration|push-subscriptions(?:\/[^/]+)?)$/,
  /^\/(?:time|health|maintenance\/status)$/,
];

const businessWriteRoutes = [
  ['POST', /^\/clients(?:\/[^/]+\/(?:branches|reveal-contact))?$/],
  ['POST', /^\/branches\/[^/]+\/departments$/],
  ['PUT', /^\/(?:clients|branches|departments)\/[^/]+$/],
  ['PATCH', /^\/(?:branches|departments)\/[^/]+\/status$/],
  ['POST', /^\/(?:installations|client_assignments)$/],
  ['PATCH', /^\/(?:installations|client_assignments)\/[^/]+$/],
  ['PATCH', /^\/crms\/change_requests\/[^/]+$/],
  ['POST', /^\/announcements(?:\/[^/]+\/read)?$/],
  ['PUT', /^\/announcements\/[^/]+$/],
  ['PATCH', /^\/announcements\/[^/]+$/],
  ['POST', /^\/help\/send-documentation$/],
  ['POST', /^\/chat\/(?:typing|messages|scheduled-meetings(?:\/[^/]+\/cancel)?|calls(?:\/[^/]+\/participants(?:\/[^/]+\/cancel)?)?|call-signal|missed-calls\/[^/]+\/dismiss)$/],
  ['PATCH', /^\/chat\/(?:messages\/[^/]+\/read|read-all\/[^/]+|calls\/[^/]+(?:\/organizer)?)$/],
  ['PUT', /^\/chat\/calls\/[^/]+\/presence$/],
];

const businessBoundary = (req, res, next) => {
  if (req.user?.role !== BUSINESS_ROLE) return next();
  if (personalRoutes.some(pattern => pattern.test(req.path))) return next();
  if (['GET', 'HEAD'].includes(req.method) && req.path === '/companies') return next();
  const scopedRead = ['GET', 'HEAD'].includes(req.method) && businessReadRoutes.some(pattern => pattern.test(req.path));
  const scopedWrite = businessWriteRoutes.some(([method, pattern]) => req.method === method && pattern.test(req.path));
  if (req.user.subsidiary_id && (scopedRead || scopedWrite)) {
    const requested = req.headers?.[BUSINESS_SCOPE_HEADER];
    if (requested && requested !== req.user.subsidiary_id) {
      return res.status(403).json({ error: 'The selected subsidiary is unavailable.', code: 'BUSINESS_SCOPE_UNAVAILABLE' });
    }
    req.businessSubsidiaryId = req.user.subsidiary_id;
    res.setHeader?.('Cache-Control', 'private, no-store');
    return next();
  }
  return res.status(403).json({ error: 'This operation is outside your authorized business scope.' });
};

// Call only with application-owned column names. The subsidiary comes from the
// authenticated profile and is never taken from a request filter.
const businessScope = (req, column, prefix = 'WHERE') => req.businessSubsidiaryId
  ? { sql: ` ${prefix} ${column} = ?`, values: [req.businessSubsidiaryId] }
  : { sql: '', values: [] };

const listBusinessScopes = async (db, owningSubsidiaryId) => {
  const [scopes] = await db.query(
    'SELECT id, subsidiary_name FROM subsidiaries WHERE id=?',
    [owningSubsidiaryId],
  );
  return scopes;
};

function canShareBusinessConversation(left, right) {
  const allows = (user, peer) => user.role !== BUSINESS_ROLE || Boolean(user.subsidiary_id &&
    (user.subsidiary_id === peer.subsidiary_id || peer.role === 'InventoryOfficer'));
  return allows(left, right) && allows(right, left);
}

function canShareBusinessMeeting(participants) {
  return participants.filter(user => user.role === BUSINESS_ROLE)
    .every(user => participants.every(peer => peer.id === user.id || canShareBusinessConversation(user, peer)));
}

module.exports = { BUSINESS_ROLE, BUSINESS_SCOPE_HEADER, businessBoundary, businessScope, listBusinessScopes, canShareBusinessConversation, canShareBusinessMeeting };

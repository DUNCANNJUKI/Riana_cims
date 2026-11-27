const BUSINESS_ROLE = 'HeadOfBusiness';
const BUSINESS_SCOPE_HEADER = 'x-cims-business-subsidiary';

const businessReadRoutes = [
  /^\/business\/overview$/,
  /^\/business\/scopes$/,
  /^\/dashboard\/stats$/,
  /^\/clients(?:\/[^/]+(?:\/(?:branches|departments))?)?$/,
  /^\/branches\/[^/]+\/departments$/,
  /^\/(?:installations|client_assignments|subsidiaries)(?:\/[^/]+)?$/,
  /^\/departments$/,
  /^\/user_profiles$/,
  /^\/installation_feedback$/,
  /^\/(?:handover_uploads|download)$/,
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
  ['PATCH', /^\/business\/staff\/[^/]+$/],
  ['POST', /^\/(?:installations|client_assignments)$/],
  ['PATCH', /^\/(?:installations|client_assignments)\/[^/]+$/],
  ['PATCH', /^\/crms\/change_requests\/[^/]+$/],
];

const businessBoundary = (req, res, next) => {
  if (req.user?.role !== BUSINESS_ROLE) return next();
  if (personalRoutes.some(pattern => pattern.test(req.path))) return next();
  if (['GET', 'HEAD'].includes(req.method) && req.path === '/companies') return next();
  const scopedRead = ['GET', 'HEAD'].includes(req.method) && businessReadRoutes.some(pattern => pattern.test(req.path));
  const scopedWrite = businessWriteRoutes.some(([method, pattern]) => req.method === method && pattern.test(req.path));
  if (req.user.subsidiary_id && (scopedRead || scopedWrite)) {
    req.businessSubsidiaryId = req.user.subsidiary_id;
    return next();
  }
  return res.status(403).json({ error: 'This operation is outside your authorized business scope.' });
};

// Call only with application-owned column names. The subsidiary comes from the
// authenticated profile and is never taken from a request filter.
const businessScope = (req, column, prefix = 'WHERE') => req.businessSubsidiaryId
  ? { sql: ` ${prefix} ${column} = ?`, values: [req.businessSubsidiaryId] }
  : { sql: '', values: [] };

const listBusinessScopes = async (db, userId, owningSubsidiaryId) => {
  const [scopes] = await db.query(
    `SELECT id, subsidiary_name FROM subsidiaries s
      WHERE s.id=? OR EXISTS (SELECT 1 FROM business_subsidiary_grants g WHERE g.user_id=?
        AND g.subsidiary_id=CONVERT(s.id USING utf8mb4) COLLATE utf8mb4_unicode_ci)
      ORDER BY subsidiary_name,id`,
    [owningSubsidiaryId, userId],
  );
  return scopes;
};

const createBusinessBoundary = db => (req, res, next) => businessBoundary(req, res, () => {
  const requested = req.headers[BUSINESS_SCOPE_HEADER];
  if (!req.businessSubsidiaryId || !requested || requested === req.businessSubsidiaryId || req.path === '/business/scopes') return next();
  if (typeof requested !== 'string' || !/^[a-z0-9-]{1,36}$/i.test(requested)) return res.status(403).json({ error: 'The selected subsidiary is unavailable.' });
  return listBusinessScopes(db, req.user.id, req.businessSubsidiaryId).then(scopes => {
    const selected = scopes.find(scope => scope.id === requested);
    if (!selected) return res.status(403).json({ error: 'The selected subsidiary is unavailable.', code: 'BUSINESS_SCOPE_UNAVAILABLE' });
    req.businessSubsidiaryId = selected.id;
    return next();
  }).catch(next);
});

module.exports = { BUSINESS_ROLE, BUSINESS_SCOPE_HEADER, businessBoundary, businessScope, createBusinessBoundary, listBusinessScopes };

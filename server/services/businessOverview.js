const queryBusinessOverview = async (pool, subsidiaryId) => {
  const [summary, staff, requests, installations] = await Promise.all([
    pool.query(
      `SELECT s.subsidiary_name,
         (SELECT COUNT(*) FROM clients c WHERE c.subsidiary_id=s.id) AS clients,
         (SELECT COUNT(*) FROM user_profiles u WHERE u.subsidiary_id=s.id AND u.is_active=1) AS active_users
       FROM subsidiaries s WHERE s.id=?`,
      [subsidiaryId],
    ),
    pool.query(
      `SELECT u.id,u.first_name,u.last_name,u.role,u.is_active,
         (u.role='User' AND NOT EXISTS (SELECT 1 FROM user_permissions p WHERE p.user_id=u.id)
          AND NOT EXISTS (SELECT 1 FROM user_module_roles umr JOIN roles r ON r.id=umr.role_id WHERE umr.user_id=u.id AND r.code<>'User')
          AND (u.is_active=1 OR EXISTS (SELECT 1 FROM business_staff_suspensions bs
            WHERE bs.user_id=CONVERT(u.id USING utf8mb4) COLLATE utf8mb4_unicode_ci AND bs.subsidiary_id=?
              AND bs.session_version=u.session_version))) AS can_manage_status
       FROM user_profiles u WHERE u.subsidiary_id=?
       ORDER BY u.first_name,u.last_name,u.id LIMIT 100`,
      [subsidiaryId, subsidiaryId],
    ),
    pool.query(
      `SELECT r.id,r.ticket_number,r.status,r.priority,r.change_description,
              DATE_FORMAT(r.estimated_completion_date, '%Y-%m-%d') AS due_date,c.client_name,r.updated_at
       FROM crms_change_requests r
       JOIN clients c ON CONVERT(c.id USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(r.client_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
       WHERE c.subsidiary_id=? ORDER BY r.updated_at DESC LIMIT 25`,
      [subsidiaryId],
    ),
    pool.query(
      `SELECT i.status,COUNT(*) AS total
       FROM installations i
       JOIN clients c ON CONVERT(c.id USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(i.client_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
       WHERE c.subsidiary_id=? GROUP BY i.status`,
      [subsidiaryId],
    ),
  ]);
  return {
    business: summary[0][0] || null,
    staff: staff[0],
    requests: requests[0],
    installation_statuses: installations[0],
  };
};

module.exports = { queryBusinessOverview };

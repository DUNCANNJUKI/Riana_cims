// Unlinked assignments use exact hierarchy scope, never a client-wide wildcard.
const sameId = (left, right, nullable = false) =>
  `CONVERT(${left} USING utf8mb4) COLLATE utf8mb4_unicode_ci ${nullable ? '<=>' : '='} CONVERT(${right} USING utf8mb4) COLLATE utf8mb4_unicode_ci`;

function technicianAssignmentSql() {
  return `(i.assigned_technician_id=? OR i.hardware_technician_id=? OR i.software_technician_id=? OR EXISTS (
    SELECT 1 FROM client_assignments ca
    WHERE (ca.hardware_technician_id=? OR ca.software_technician_id=?)
      AND (${sameId('ca.installation_id', 'i.id')} OR (
        ca.installation_id IS NULL
        AND ${sameId('ca.client_id', 'i.client_id')}
        AND ${sameId('ca.branch_id', 'i.branch_id', true)}
        AND ${sameId('ca.department_id', 'i.department_id', true)}
        AND (i.branch_id IS NOT NULL OR
          CONVERT(LOWER(TRIM(COALESCE(ca.branch,c.branch,''))) USING utf8mb4) COLLATE utf8mb4_unicode_ci =
          CONVERT(LOWER(TRIM(COALESCE(c.branch,''))) USING utf8mb4) COLLATE utf8mb4_unicode_ci)
      ))
  ))`;
}

module.exports = { technicianAssignmentSql };

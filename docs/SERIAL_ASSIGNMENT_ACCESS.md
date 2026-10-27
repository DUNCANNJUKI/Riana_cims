# Serial installation assignment access

## Diagnosis

The serial picker previously accepted direct installation technician fields or a
client assignment linked by installation ID only. Assignments created before an
installation can have a null installation ID, while retaining a specific client,
branch and department. The Installations UI recognized these scopes but inventory
did not, producing "You are not assigned to this installation."

## Authorization

Inventory capabilities and subsidiary boundaries remain mandatory. For a User,
the inventory installation guard accepts one of:

- The installation's assigned, hardware or software technician ID.
- A hardware/software technician assignment linked to this installation ID.
- An unlinked assignment with the same client, exact branch ID and exact
  department ID (including null equality). Legacy branches without IDs must also
  match the normalized branch label; blank assignment labels use the client's
  legacy branch label.

An assignment explicitly linked to another installation never receives the
scope-based fallback. No assignment records are rewritten, no new permissions
are granted and no serial availability or physical verification rules change.
The catalogue and shared guard used by serial suggestions, installation hardware
and allocation use the same predicate in installationAssignment.js.

## Validation And Support

The isolated MariaDB integration test covers direct ownership, unlinked exact
scopes, different branches/departments, explicitly linked assignments, legacy
branch labels and cross-subsidiary rejection. No live database migration is
needed. Rollback restores the previous inventory service and removes its new
helper, followed by an API restart; assignment data remains untouched.

If rejection persists, verify the logged-in technician's ID, client assignment
hardware/software technician IDs, installation link, subsidiary, branch and
department. A manager must correct a genuinely incorrect assignment; do not
disable authorization or mark unverified stock available to bypass the error.

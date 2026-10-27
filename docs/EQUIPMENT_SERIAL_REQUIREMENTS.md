# Equipment Serial Requirements

Every equipment item, including kiosks, is optional until an authorized manager checks Serial Required for that subsidiary. No subsidiary has a hardcoded kiosk requirement. Any serial supplied must still match its registered model, quantity, subsidiary and eligible device state.

Open Equipment Requirements in Hardware & Inventory, or Equipment Serial Requirements from Installations. Inventory Officer, SuperAdmin, Admin and Teamlead can view equipment across subsidiaries. SuperAdmin can edit every subsidiary; other permitted managers can edit their own only. Catalogue visibility does not expose foreign-subsidiary assets or grant allocation privileges. Technicians retain explicit inventory grants and assigned-installation checks.

Typing refreshes suggestions after 250 ms. Initial results show eligible stock. Typed matches also show registered but blocked devices with reasons for verification, approval, condition, reconciliation, allocation or archival. The reported MRZ-QMS-C2-26-1010 is Generated and unverified: an authorized officer must use Receive & Verify. Its physical state was not silently changed.

Required counts are checked by both the UI and API; failures roll back installation/inventory writes. Optional items can have no serial. Supplied hardware still requires approval, verification and installation before completion. Historical signed/completed records retain their workflows. Open requirement screens refresh every 15 seconds; mutations invalidate local caches and API saves read current settings.

## API

- GET /api/hardware/equipment-requirements: authorized manager catalogue across subsidiaries.
- GET /api/hardware/equipment-requirements?subsidiary_id=ID: subsidiary requirements; technicians cannot request another subsidiary.
- POST /api/hardware/equipment_requirement: subsidiary_id, equipment_field and boolean serial_required. Uses Idempotency-Key, transactional audits and subsidiary edit checks. Every supported item can be set true or false.
- GET /api/hardware/assets?suggestions=true&selection_installation_id=ID&q=SERIAL: scoped matches with selectable and unavailable_reason. Existing inventory permissions and technician assignment checks remain enforced.

## Rollout and Rollback

Migration server/migrations/20261014_equipment_serial_requirements.sql adds a table with a composite subsidiary/equipment key and restrictive foreign keys. Missing settings are optional for all equipment. It changes no existing assets, serials, installations or handovers.

```powershell
node server/scripts/apply-equipment-requirements.cjs
```

The standard deployment migration runner also discovers the SQL file. Apply before restarting an inventory-enabled API. Creation is safe to repeat. Rollback restores the scoped application changes and leaves the new table and settings intact; do not delete retained records.

## Checks

Backend and isolated MariaDB checks cover configured required/optional rules, foreign-subsidiary edit rejection, kiosk requirement toggling, catalogue visibility, typed generated-serial lookup, allocation and completion rollback. Intercepted Playwright checks cover desktop/mobile typing, disabled generated serials and scoped checkboxes. Browser plugin is unavailable, so Playwright is used. Existing Chat/Finance TypeScript failures remain outside this change.

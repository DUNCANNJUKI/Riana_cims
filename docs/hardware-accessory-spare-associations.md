# Hardware accessories and spares

Hardware inventory now supports two controlled component paths:

- **Serialized items** use the existing generate → receive/verify → assign flow. A verified serialized asset can be attached to one parent equipment record as an accessory or spare.
- **Quantity-based items** (for example cables, adapters and screws) are received into subsidiary/location stock and attached by quantity. Available quantity is calculated from active associations and is checked again while the association is locked.

Associations are subsidiary-scoped, audited, and removable with a required reason. Serialized components cannot be nested, transferred across subsidiaries while attached, or allocated independently. Parent equipment must be approved, physically verified and reconciled before a component can be associated. These rules preserve the existing fail-closed serial issuance policy.

The responsive inventory profile exposes search, relationship, purpose/slot, quantity and return/consume controls. The equipment configuration form uses consistent, touch-sized equipment icons with a responsive icon tile so labels remain readable on narrow screens.

## Database and rollback

Migration `20261123_hardware_components.sql` is additive and creates `hardware_component_stock` and `hardware_asset_components`. No existing rows are deleted. To roll back, disable the component controls at the route/UI layer, preserve the tables for audit, and use a reviewed DBA migration only after exporting association history; do not drop the tables during an incident.

## Verification

Run `node scripts/run-isolated-db-tests.cjs` for migration, concurrency, scope, allocation and scheduling coverage. Run `npm.cmd run typecheck`, the focused ESLint command, and `npm.cmd run build:all` before release.

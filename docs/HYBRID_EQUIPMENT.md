# Hybrid Equipment

## Model

Existing built-in equipment retains its installation columns and serial mappings.
New types are subsidiary configuration records identified by an opaque
`custom_<32 hexadecimal characters>` key, not a user-supplied SQL column or label.
Labels and success wording are editable; IDs never change on rename.
Custom installation counts live in `installations.equipment_quantities` JSON.
The installation equipment form is rendered by iterating the saved definitions:
labels, order and visibility are not a separate hard-coded set of inputs.
Renaming any built-in or custom label does not rename its database column or ID.
Removing a definition hides that form field without erasing old quantities.
The two legacy text sources retain their data types; existing per-display names
and type selection are preserved. A type source is required only when it is in
the subsidiary's configured form. Built-in templates are compatibility defaults
for subsidiaries without a saved configuration, not overrides of saved labels.
The shared configuration drives the editor, installation inputs/details,
handover rows/PDF, serial selection, model mapping and serial-required settings.

The existing `PATCH /api/subsidiaries/:id` accepts `equipment_configuration`
entries with `field`, `label`, and `installed_status`. SuperAdmin authorization is
unchanged. Installation POST/PATCH accepts `equipment_quantities` as an object of
custom IDs to integers from 0 to 10000; only that client's subsidiary definitions
are accepted. The hardware catalogue exposes `equipment_fields_by_subsidiary`.
The existing equipment_map/equipment_requirement operations use `equipment_field`
and `subsidiary_id` for built-in or registered custom types. Installation serial
selection continues to use the original hardware_selection contract.

## Workflow

SuperAdmin opens Subsidiary Configuration, chooses E-Handover Equipment, enters a
new equipment name and success status, clicks Add New Type, then Save Configuration.
Existing management permissions are unchanged. Inventory officers map an approved
hardware model to the item in Hardware & Inventory and configure Serial Required
for their subsidiary. All types are optional until explicitly configured.
Technicians enter quantities and select verified serials when required. Inventory
changes reflect allocated physical assets, not fabricated stock from quantities.

Names are presentation metadata. Renaming a quantity source does not automatically
move models from another source: officers must map the model to the correct item.
In-use custom items cannot be removed if quantities, model mappings or compulsory
serial settings reference them. Renaming remains allowed. Restore Defaults retains
custom types. Removing a built-in row from the handover list never deletes its
underlying installation data or serial policy.

## Deployment And Rollback

Run the consolidated cloud SQL before restarting the new API. The additive
`20261015_hybrid_equipment.sql` migration adds nullable JSON storage only and is
safe to repeat. The local targeted migration script backs up affected installation
and subsidiary records under `.runtime/backups` before applying it. Do not run the
entire migration directory as a substitute for the consolidated release SQL.
Preserve external uploads, secrets, routing and the startup wrapper.

For rollback restore prior code/lockfiles; retain JSON data, definitions and all
inventory history. Do not drop custom quantities after technicians start using
them. Standard live database backups remain required before DDL deployment.

## Verification

Backend tests cover custom IDs, name changes, quantity bounds, cross-subsidiary
rejection, serial requirement enforcement, physical allocation, handover hardware,
removal protection and preservation of the original workflows. Browser fixtures
cover add/edit/save/reopen, persistent errors, custom quantity entry, handover rows,
serial selection and responsive editor layout. Browser fixtures never alter live
customer records.

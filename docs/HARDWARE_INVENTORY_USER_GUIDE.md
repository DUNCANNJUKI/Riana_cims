# Hardware & Inventory User Guide

Riana CIMS | Operator guide | 14 October 2026

## Start Here

For a global overview, open the profile/avatar menu in the CIMS header and select **System Tour**. It highlights the real navigation items available to your account, followed by shared notification, messaging, theme and profile controls. On mobile it temporarily previews navigation and restores the previous drawer state when finished. It does not follow external links or open/edit business records.

Open **Hardware & Inventory** from the sidebar and select **Module Tour** for its control-by-control walkthrough. The spotlight scrolls to each actual feature and displays an explanation beside it: stock metrics, models, policy, generation, row actions, QR scanning, reports, stocktake, alerts, locations, advanced filters, exports, labels, imports and drafts, subject to permissions. On mobile the installation step may point to the main navigation button; follow Installations there after the tour. Asset-dependent actions are reached through the highlighted row action button; empty registries cannot demonstrate a device-specific action.

Use Next, Back, the close icon (End Tour) or Finish Tour; Escape also closes it. The module tour previews tabs, restores your previous tab when closed, and never generates serials or changes records. Both tours can be repeated at any time.

The normal device journey is:

**Approve model and policy -> Generate serial -> Receive and verify device -> Allocate -> Confirm installation -> Track lifecycle.**

Already-installed historical equipment follows the separate **Register Legacy Hardware** workflow. A record, a serial and a physical device are not interchangeable.

## Roles and Access

| Role | Typical responsibilities |
| --- | --- |
| Superadmin | Global visibility and all defined permissions, including model/policy decisions and sensitive approvals. |
| Inventory Officer | Authorized subsidiary stock, registration, issuance, receipt, allocation, labels, reconciliation and permitted lifecycle actions. |
| Technician | Authorized installation equipment selection, custody handoff, permitted field registration and installation confirmation. |
| Management | Authorized inventory visibility, reports and exports. |
| Model/policy approver | Separately granted model approval and serialization-policy governance. |

Actual permissions may include explicit user grants. Not every Inventory Officer is a model approver or allowed cross-subsidiary transfers, retirement approval, bulk-import approval or manufacturer-identity modification. Superadmin permissions do not bypass authentication, immutable identities, stock verification or lifecycle integrity checks.

QR scans, searches, exports and asset links use the same backend access controls as the registry.

For technician accounts, Assign and Reserve require **Physical identity and serial confirmed** before submission. Check the actual device against its serial, then select the checkbox and confirm. Existing installation assignment and subsidiary restrictions still apply.

## Installation Serial Selection

Serial requirement settings control required versus optional equipment per subsidiary. All items, including kiosks, default to optional. Open **Equipment Requirements** in inventory, or **Equipment Serial Requirements** in Installations, to configure them. Managers can view all subsidiary equipment and edit their own subsidiary; SuperAdmin can edit all. See [Equipment Serial Requirements](EQUIPMENT_SERIAL_REQUIREMENTS.md) for current rules. A registered serial in Generated state must be received and verified before selection; typing displays that reason.

Inventory officers and administrators can use **Models -> Map Equipment Item** to associate an existing hardware model with an installation quantity field. The same **Installation Equipment Item** selector is available in Generate Serials. Standard models initially match their existing family (QMS/SSK kiosks, MC media controllers, LED displays, DS digital signage, FBT tablets). Explicit mappings override that default and can cover UPS units, speakers and other supported equipment fields. Return linked hardware before changing a mapping. New hardware designs still use Propose Model and the normal approval process.

In Add/Edit Installation, quantities greater than zero show the corresponding mapped equipment categories under **Equipment Serials**. Choose the category, search by official or manufacturer serial, and select registered eligible devices. The selection counter follows the quantity; one device cannot fill two slots. Existing linked equipment remains visible and must be returned through its lifecycle workflow rather than silently removed from the form. Unknown serials are not fabricated: inventory staff must first register or generate the device and physically verify it into stock.

Select **Physical devices match the selected serials** before saving. Saving assigns selected equipment to the installation and updates inventory automatically. When the equipment is actually installed and you have installation-confirmation permission, also select **Selected equipment is physically installed**; the same save records Installed status, installation date, custody and lifecycle history. Managers can save planning records before allocation; technician saves require only the serials configured as required for their subsidiary. Optional equipment may have no serial. Handover/completion requires configured counts and verified, approved Installed records for supplied serials. Existing signed handover snapshots remain historical.

After a handover PDF or image is uploaded for an installation with linked equipment, each page is captured as a private PNG in every Installed device's **Supporting Documents**. The original uploaded handover remains available. Image access uses the existing authenticated file routes and subsidiary restrictions. Invalid or oversized documents fail explicitly and do not complete the installation or leave partial supporting images. Limits are 10 MB per input, 20 PDF pages, a 30-second rendering deadline, and 100 MB of supporting images per installation upload.

When an operation fails, its error remains inside the dialog and your selections are preserved. Correct the reported issue and retry; opening another operation clears the previous message.

## What the Fields Mean

| Field | Meaning |
| --- | --- |
| Marezi serial | Permanent official identity, such as `MRZ-QMS-C1-26-1001`. Issued numbers are unique and never reused. |
| Model | Approved hardware design, such as `Wave-26-C1`. |
| Manufacturer serial | The physical manufacturer's identity; duplicate identities require investigation. |
| Owning subsidiary | Organizational ownership and inventory access scope. |
| Inventory location | Recorded stock location, separate from the client installation. |
| Custodian | Person holding the equipment, usually the receiving technician. |
| Client / branch installation | Where the device is reserved, allocated or currently installed. |
| Physical condition | New, Good, Fair, Poor or Unserviceable. Not Assessed means no condition is recorded. |
| Physical verification | Whether the physical device was inspected and its identity confirmed. |
| Registration approval | Approved, Pending or Rejected; separate from physical verification. |
| Stock reconciliation | Whether physical stock observations match the record, or information/discrepancies need resolution. |
| Operational status | The current lifecycle stage, not the condition or approval decision. |

**Not Issued** identifies an unissued record. **Serial Pending Reconciliation** identifies historical equipment whose Marezi identity is missing. An installed legacy asset may legitimately have an unknown serial; do not invent one or change its historical installation to hide missing information.

## Statuses

| Status | Operational meaning |
| --- | --- |
| Generated | A serial is issued; the physical device has not yet been verified into available stock. |
| Available | Physically verified equipment awaiting allocation. Available reports/counts also require approval, acceptable condition, known identity/year, matched reconciliation and no active allocation. |
| Reserved | Held for a selected installation until released, allocated or expired. |
| Assigned | Allocated to a technician or installation; not yet confirmed Installed. |
| Installed | Currently confirmed at its installation. |
| Faulty | A fault has been recorded. |
| Under Maintenance | In service/repair. |
| In Transit | Dispatched transfer awaiting receipt. |
| Returned | Returned for inspection; verification is needed before redeployment. |
| Retired | Removed from operational deployment. |
| Disposed | Disposal has been recorded with the required authorization/evidence. |

Archive is separate from status. It preserves the record and history rather than deleting an issued identity.

## 1. Prepare Models, Policy and Locations

1. Review **Models** and open a model to view its definition, decisions and revision history.
2. Authorized users select **Propose Model**, choose the official variant and real introduction year, and record specifications.
3. A model approver records an approval/rejection decision and reason. Only approved current models can issue new serials.
4. The policy administrator reviews **Policy**, approves the configured per-model sequence partition with a real organizational reference, and selects the field-approval rule.
5. Create authorized subsidiary stock locations in **Locations** before receiving equipment.

Official model format: `[Nickname]-[YY]-[Variant][Model Sequence]`.

Official serial format: `MRZ-[Family]-[Variant][Model Sequence]-[YY]-[Unit Sequence]`.

Wave is QMS variant C; Core is the selected MC variant M extension. In the implemented naming policy, serial YY follows the model introduction year. Actual manufacturing year is a separate field and cannot precede that model year. Unit counters start at 1001 and are allocated by the backend under database locks; the four-digit range ends at 9999. Do not type a desired next number. Formal policy approval is required before issuance.

Cosmetic/software changes use permitted specification amendments. A significant hardware redesign requires a new model. Retired Edge definitions are for historical backfill, not new product launches.

## 2. Generate and Receive New Stock

1. Select **Generate Serials**.
2. Choose an approved model, owning subsidiary, actual manufacturing year, quantity and optional location. Serial year is model-derived and read-only.
3. Confirm. The backend issues the next numbers; generated records are selected for optional label printing.
4. Open each physical device's serial record and select **Receive & Verify**.
5. Record/check manufacturer serial, actual condition and stock location. Confirm physical identity and serial, then submit.
6. Check the record is eligible Available stock before allocation. Generated records alone never increase the Available count.

Single issuance and bulk issuance require their respective permissions. Bulk generation does not verify a batch of physical devices. The backend checks approval, uniqueness and sequence limits; idempotent request handling protects uncertain network retries from issuing duplicate batches.

## 3. Allocate or Reserve Equipment

1. Open an eligible Available asset and choose **Assign** or **Reserve**.
2. For a client job, choose the **Client**, its **Client / Branch Installation**, and receiving technician where applicable.
3. For technician custody before a job is chosen, leave the client/installation blank and select the receiving technician.
4. Confirm the allocation. The record becomes Assigned, or Reserved with the chosen expiry period.
5. An assigned technician can later select their held equipment in an authorized installation; the existing custody assignment is linked rather than duplicated.

Only eligible stock is selectable. Conflicting active allocations, expired reservations, wrong-client installations and unauthorized subsidiaries are blocked. Normal allocation to completed installations is blocked; use historical backfill or the authorized replacement process.

Reservations require an installation. Release an expired/cancelled reservation before reallocating. Ownership, stock location, technician custody and client installation are separate concepts.

## 4. Install and Complete Handover

1. Open the existing installation and its **Equipment / Hardware Details** section.
2. Select Existing Serial, search/scan the physical identity, and select eligible available, reserved or technician-held equipment.
3. Record installation-specific details and confirm the physical match before adding equipment.
4. Alternatively, authorized field users can Register & Generate for a new physical device using an approved model and manufacturer identity. Do not generate another record for an existing asset.
5. Obtain any required field-registration approval. Pending/rejected or physically unverified equipment cannot bypass completion controls.
6. Confirm each device Installed, then finish the existing installation/handover workflow.

Multiple devices can belong to one installation. Completed handovers use stored hardware snapshots. Later returns, transfers and replacements do not silently rewrite signed historical handovers.

## 5. Scan a QR and Review History

1. Select **Scan QR** in the registry, or scan a printed label with a phone's QR reader.
2. Open the CIMS link and sign in if prompted. The QR holds an opaque asset identifier, not credentials or private client/network configuration.
3. The authorized profile opens with its lifecycle timeline, followed by current details, assignment history and supporting documents.
4. Review the recorded action, operator, date/time in EAT and reason/details. Full audit history requires the relevant permission.

Use manual serial/asset search when a camera is unavailable. Unknown QR identities and inaccessible subsidiaries are not disclosed. A kiosk keeps the same QR identity through repair, transfer, replacement history and retirement.

Select rows and use **Labels** for bulk previews; open an asset and use **QR Label** for that device. Label layouts support A4 and the provided thermal format. Inspect a printed test label before production batches.

## 6. Faults, Repairs, Returns, Transfers and Replacements

Open the asset; only permitted actions compatible with its current state are offered.

- **Report Fault:** record the fault reason and supporting evidence.
- **Start Maintenance / Complete Repair:** record diagnosis, work/resolution and document references. Repaired stock returns for physical verification before reuse.
- **Acknowledge Return:** close the current allocation and preserve its history; inspect/verify the device before making it available again.
- **Dispatch / Receive Transfer:** choose the destination subsidiary/location, provide cross-subsidiary approval where required, and confirm receipt.
- **Replace Hardware:** select an eligible replacement identity, confirm its physical device and record the reason. The old and new serials remain distinct and both histories are retained.
- **Approve Retirement / Disposal:** obtain the appropriate permission and record the reason and required evidence. These devices cannot be used for new installations.
- **Archive:** preserve eligible registered records; issued/installed historical equipment is not permanently deleted. Only eligible unissued drafts may be deleted.

Current maintenance limitation: replace installed/faulty equipment **before** sending the removed device to maintenance. Maintenance closes its active assignment; a combined replacement-after-maintenance workflow is not yet available. Automatic signed handover amendment generation is also pending.

## 7. Register Historical Devices and Import Records

Use **Register Legacy Hardware** for equipment already in service. Select the verified model, actual manufacturing year when known, existing identity and historical installation. Confirm the physical device and condition where linking installed equipment.

Preserve unknown values and use authorized identity reconciliation later. Never invent a historical serial, manufacturing year or installation date. Existing completed handovers are not regenerated by backfill.

Use **Import** for supported CSV/Excel Legacy or Draft rows. Preview the validation results, fix row errors and duplicate identities, then obtain the required bulk-import approval/reference before committing. Review any row-level failures after submission. New official serial issuance uses Generate Serials, not the legacy importer.

## 8. Stocktake and Alerts

1. Select **Stocktake**, then subsidiary and inventory location.
2. Scan or enter observed asset IDs/serials from physical stock.
3. Review matched, missing and unexpected observations; record evidence and investigate discrepancies.
4. Use authorized receipt/reconciliation actions to correct verified facts. Do not erase history to balance stock.

**Stock Alerts** shows configured low-stock thresholds, aging stock, warranty warnings and reconciliation issues. Missing stock is excluded from available eligibility. Alerts are currently in-app; scheduled email/SMS delivery is not yet implemented.

## 9. Search, Reports and Exports

The registry offers search, subsidiary and status filters. **Advanced Filters** adds family, model, location, client, branch, technician, dates, sorting and archived records. Selections remain when the panel closes. Changing a parent filter clears dependent selections; Clear All resets filters. Search is debounced. Page size and result ranges use server-side pagination.

Use **Reports** for Installed, Available, Generated/Unverified, Reserved, Assigned, Faulty, Maintenance, Replacements, Stock Movements, Technician Equipment, Uninstalled, Legacy Backfill, Reconciliation, Warranty and Asset Lifecycle views. Add client/branch/technician filters when reviewing their particular equipment. Lifecycle and movement views describe recorded events; status reports describe current assets.

Movement reports and history exports include **Performed By**, **Date / Time (EAT)**, action and readable details. Operator IDs are retained; current names are displayed when available. Missing historical information is marked rather than fabricated. Date filters on registry/status reports use registration dates; movement report dates use event dates. Dates are not a substitute for a dedicated service-date filter.

Use **Export** for CSV, Excel or PDF where permitted. Exports apply authorized scope and selected filters. Avoid concurrent inventory updates when preparing reconciled exports: the current exporter reads pages rather than one consistent database snapshot. Large exports and physical printer layouts require operational validation.

## Common Problems

| Problem | Check / action |
| --- | --- |
| Cannot issue serials | Confirm policy approval/reference and approved current model; inspect the sequence exhaustion message. |
| Generated record is not Available | Receive and physically verify it; check approval, condition, identity/year and reconciliation. |
| Cannot allocate | Inspect current custody/assignment, subsidiary, client installation, reservation expiry and stock eligibility. |
| Installation cannot complete | Approve required field registration and confirm all linked equipment Installed. |
| Missing Marezi identity | Reconcile the physical historical identity with an authorized user; do not generate a replacement identity for the same device. |
| Camera unavailable | Use manual lookup and check camera permission/HTTPS on the device. |
| QR access denied | Sign in and verify inventory/audit permissions and subsidiary access. |
| Record/action not visible | Check filters, archived inclusion, role grants and current lifecycle state. |
| Network request uncertain | Retain the operation's retry key; refresh/check the registry before starting another issuance. |
| Required facts are unknown | Mark for reconciliation and collect physical evidence; do not fill in guesses. |

## Operational Acceptance Checklist

- Model and policy approvals are real and traceable.
- Physical stock is verified independently of issued serials.
- Manufacturer identities and duplicate-device checks have been reviewed.
- Ownership, location, custody and installation are correct.
- Required approvals and installation confirmation precede completion.
- QR links open authorized profiles and printed labels scan correctly.
- Reports, event operators and EAT timestamps match the underlying records.
- Unknown historical fields and stock discrepancies are investigated rather than hidden.

Technical architecture, API/migration details, test results, rollout gates, recovery instructions and remaining limitations are documented in [Hardware Inventory Technical Guide](HARDWARE_INVENTORY.md). Production deployment still requires separate approval and validation.

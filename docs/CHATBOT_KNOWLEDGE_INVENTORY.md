# RIANA CIMS Assistant Knowledge Inventory

Last verified: 3 November 2026

| Article | Module | Status | Authorization | Primary implementation evidence |
|---|---|---|---|---|
| Create an installation | Installations | Implemented | `installations.manage` | Installation module, server access control |
| Assign a technician | Assigned Technicians | Implemented | `assignments.manage` | Assignment module and APIs |
| Installation progress | Installation Progress | Implemented | `progress.view` | Progress module; Management deny rule for updates |
| Installation budget | Finances | Implemented | `finances.view`; writes require manage | Technician finance module and 2026-11-02 budget migration |
| Register hardware | Hardware & Inventory | Implemented | `inventory.register` | Inventory module, hardware routes, capability registry |
| Generate serials | Hardware & Inventory | Implemented | `inventory.generate_serial` | Inventory module and hardware routes |
| E-Handover | Installations/Handover | Implemented | `installations.view` | Handover module and existing assistant lookup |
| Installation feedback | Installations | Implemented | `installations.view` or authorized link | Feedback components and feedback API routes |
| Reports | Reports | Implemented | `reports.view` | Reports module and permission registry |
| Change requests | Developers | Implemented | CRMS role routing | Developers workspace and CRMS routes |
| Calls and screen sharing | Chat | Implemented | Authenticated user | Chat module, signaling routes, device controls |
| Messages and saved history | Chat | Implemented | Authenticated user, user-scoped records | Message, save, visibility, and preference routes |
| Account security | Profile | Implemented | Authenticated account owner | Passkey, TOTP, recovery-code, password, and session routes |
| Scheduling | Workload Calendar | Implemented | Route/role scope | Scheduling routes and calendar components |
| System administration | Administration | Implemented | Separate management capabilities | Users, company, subsidiary, backup and audit modules |
| Access restrictions | Security | Implemented | Server effective permissions | Server and frontend capability registries |

## Feature status rules

- **Implemented** means both a current code path and its authorization/navigation evidence were found.
- **Partially implemented** content is not published as available guidance unless the limitation is explicit.
- **Staging-only**, **disabled**, and **planned** features are excluded from retrievable guidance.
- External RIANA OPTIMUS behavior is not indexed beyond the verified outbound navigation because its implementation is outside this repository.

## Evaluation questions

The maintained evaluation set includes installation creation, technician assignment, progress access, technician-budget calculation, missing technicians, handover, hardware registration, serial generation, feedback, reports, change requests, calls, screen sharing, account security, schedules, administration, permission denial, prompt injection, credential requests, missing records, and authorized follow-ups.


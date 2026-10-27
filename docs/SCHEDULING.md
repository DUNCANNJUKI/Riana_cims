# Scheduling Architecture And Delivery Report

## Scope

This release implements a centralized scheduling foundation and an additive timed
activity workspace. It is not complete fulfillment of every feature in the master
brief. The implemented/remaining matrix below is the acceptance boundary.
Existing installation, handover, inventory, feedback and Developers workflows are
retained. No historical dates or questionable records are automatically rewritten.

## Audit And Dependency Map

| Module / fields | Classification | Integration |
| --- | --- | --- |
| Assignments installation_start_date / scheduled_end_date | Date-only planned range | Shared server date validation; transactional resource conflict guard |
| Installations scheduled_end_date | Date-only deadline | Shared validation; not fabricated as an hourly booking |
| Installations assigned_date / completion_date | Actual / historical record | Existing authorized recording workflow retained |
| Installation handover / supporting files | Historical evidence and recorded timestamps | Unchanged; no file paths or dates rewritten |
| Announcements expires_at | Future instant | Strict server-now validation for newly selected values |
| System maintenance estimated_completion | Future instant | Strict server-now validation; not a technician appointment |
| Developers estimated_completion_date | Date-only deadline | Shared server validation and clock-backed picker |
| Developers date_requested / audit logs | Actual / system timestamp | Unrestricted historical recording under existing permissions |
| Client start dates | Business-effective / historical | Existing workflow retained |
| Inventory manufacturing year, warranty, reconciliation | Historical / business-effective / system timestamp | Existing inventory policies retained |
| Report and analytics date ranges | Reporting filter | Past dates remain selectable |
| Existing Workload Calendar | Legacy date-only assignment visibility | Retained for management |
| Timed Schedule | New future activity / recurring instances | Shared UTC/time-zone engine, resource locks, versions, history and jobs |
| Notifications | System-generated delivery | Existing dispatcher unchanged; new scheduling jobs currently deliver in-app |
| Subsidiary / branch calendars | Scheduling policy | Organization -> subsidiary -> branch inheritance |

Frontend: CIMS and Developers PlanningDateInput -> shared usePlanningDate ->
shared serverClock -> GET /api/time. The timer uses performance.now, not the device
wall clock; it refreshes on focus/visibility, reconnect attempts and periodically.

Backend: authenticated routes -> planningDates middleware for legacy fields;
timed scheduling routes -> scheduling service -> schedulingTime / Temporal ->
policy resolution -> resource locks/current conflict reads -> event/history/jobs
transaction. A worker delivers due, version-valid in-app jobs transactionally.

There are no existing independent leave, certification or resource-reservation
tables to integrate. Leave entered as a timed activity blocks its selected
resources. External HR/skills systems are not checked. No offline booking queue
was introduced.
The legacy month filter now includes assignments starting in the previous month
that continue into the selected month. A separate same-Date-object mutation that
hid single-day assignments without an end date was removed. Comparisons use
validated date-only strings, and the API returns those fields as date-only values.

## Time And Validation

- Date-only values stay YYYY-MM-DD and compare against the business calendar day.
- New scheduled instants must be strictly later than server now plus policy lead.
- End must be strictly after start. Intervals are half-open, so zero-buffer
  appointments can touch at their boundaries without conflict.
- All new event instants and application-written scheduling history timestamps
  use UTC. API values are ISO 8601 with Z. SQL reads cast UTC DATETIME fields to
  strings to avoid accidental conversion by the legacy mysql2 local-time parser.
- Local input is resolved with the activity IANA zone, then branch, subsidiary and
  organization defaults. Company timezone is the existing organization default.
- Temporal rejects DST gaps and ambiguous local input. Explicit ISO offsets can
  disambiguate an instant through the API; the native picker cannot select folds.
- No global weekend ban or arbitrary future horizon is seeded. Restrictive
  calendars apply only when configured.
- Unchanged legacy expired values remain editable without rewriting history.
  A newly chosen expired instant is rejected, including an exact current-minute
  value. New time pickers offer the next minute.
- Invalid input, closure/working-hour violations, expired schedules, conflicts and
  stale versions return actionable errors and machine-readable SCHEDULE_* codes.
- The final transaction rechecks scheduled starts before commit. Offline users
  cannot obtain authoritative confirmation. Forms retain data after failures.

GET /api/time exposes only current UTC time and organization time zone, with
no-store caching. Scheduling API routes remain authenticated and subsidiary-scoped.
The server and database host clocks must be maintained by their OS time service.
This application does not change Windows/Linux system clocks. The read-only local
audit measured approximately 2 ms difference; this is not certification of NTP.

## Policies

Business Calendar edits the selected organization, subsidiary or branch overrides.
Rules are validated server-side and policy changes are versioned and audited.
Only SuperAdmin manages organization defaults. Other policy managers need the
existing subsidiaries.manage permission and remain scoped to their subsidiary.

Supported JSON settings:

```json
{
  "time_zone": "Africa/Nairobi",
  "working_days": [1, 2, 3, 4, 5],
  "working_hours": {"start": "08:00", "end": "17:00"},
  "holidays": ["2026-12-25"],
  "minimum_notice_minutes": 30,
  "buffer_minutes": 15,
  "maximum_horizon_days": 365,
  "reminder_minutes": [1440, 120, 30, 0],
  "overdue_minutes": 30
}
```

Days use Sunday=0. Omit working_days / working_hours for unrestricted operation;
the example is not a seeded default. A null horizon means no policy horizon.
Buffers reserve preparation/travel time around bookings. A SuperAdmin can supply
a business-calendar override reason; it is saved in history and bypasses only
working days/hours/closures, never past-time, conflict or tenant checks.
Existing accepted bookings retain their policy snapshot on status-only updates.
Legacy assignment/installation pickers request their authorized branch/subsidiary
calendar zone. Where that metadata is unavailable, they retain server organization
time and display a warning; final backend validation still resolves the actual
scope. Developers deadline inputs currently display organization time while the
backend resolves branch policy. This UI hierarchy gap is not marked complete.

## Availability And Concurrency

The service checks active timed events, including leave, and active date-only
legacy assignments. Legacy dates conservatively reserve their complete local day
range; the service does not invent missing appointment times. No automatic
technician reassignment or unverified alternative slot suggestion is made.

Technician rows lock in deterministic ID order inside booking transactions.
Conflict queries use FOR UPDATE current reads after those locks; normal snapshot
reads were found insufficient under REPEATABLE READ and corrected. Both legacy
assignment writes and new timed bookings participate in these locks when enabled.
Concurrent collisions / deadlocks return a conflict instead of confirming both.

Availability says No recorded conflict, not a guarantee that unintegrated external
calendars are clear. Final persistence always rechecks. Retired/deactivated resource
records do not prevent authorized cancellation/completion of existing bookings.
Deletion guards protect parent records referenced by scheduling history.

## Lifecycle, Recurrence And Reminders

Supported workflow states: scheduled, in_progress, completed, cancelled. Overdue is
computed separately from deadlines; appointments are never automatically completed,
missed or silently moved. Rescheduling requires a reason and expected version.
History retains old/new values and actor; optimistic locking rejects stale updates.

Recurrence uses rrule for daily, weekly, monthly, quarterly and annual batches,
with custom interval via the API. Each explicit batch has 2-100 instances. Local
wall time is retained across DST; every occurrence validates and the batch commits
atomically or rolls back. Unique occurrence identities and request keys prevent
duplicates. One occurrence may be edited/cancelled; Cancel Future Series preserves
past/running instances. Series configuration is retained separately.

Future reminder offsets, start-time notices and an overdue notice are durable
database jobs. Rescheduling cancels obsolete job versions and generates new jobs.
Cancellation notices are queued for affected users. The worker uses bounded
batches, transactional in-app inserts with deterministic IDs, bounded retries and
failed-state recording. It checks event version, recipient scope/active status and
linked installation completion. Stale/cancelled jobs cannot leak into delivery.

New timed-schedule email/SMS jobs are NOT implemented. Existing assignment
email/SMS notification behavior is retained. Do not claim external scheduled
delivery or exactly-once provider behavior.

## UI And API

Workload Calendar contains Timed Schedule for management. Technicians receive a
self-scoped timed view without the legacy cross-technician calendar. Native date
inputs retain keyboard navigation, update at midnight and fail closed when the
server clock cannot be fetched. Historical and report inputs are not constrained.
Mobile dialogs keep actions outside the scrollable form. Conflicts remain inline.

- GET /api/time: public clock only.
- GET /api/scheduling/catalog: authorized subsidiary/resource/branch choices.
- GET /api/scheduling/policy: resolved settings, overrides and expected version.
- PUT /api/scheduling/policy: authorized, scoped, audited policy update.
- GET /api/scheduling/events: paginated scoped agenda; from/to calendar filters,
  technician, subsidiary, branch and time_zone parameters.
- POST /api/scheduling/events: create, with Idempotency-Key.
- PATCH /api/scheduling/events/:id: versioned change and reason, with Idempotency-Key.
- POST /api/scheduling/availability: advisory check against integrated sources.
- GET /api/scheduling/events/:id/history: scoped history, up to 100 rows.
- POST /api/scheduling/events/:id/cancel-series: reason/version, future instances only.

New booking timestamps accept local ISO input with time_zone or explicit ISO
offsets. Resource IDs must be active members of the selected subsidiary for new
bookings. Unassigned activities are permitted. CSV exports label the current page;
they do not pretend to include the entire paginated dataset. Formula escaping is on.

## Acceptance And Known Remaining Work

Verified: strict future starts, deadlines, overnight/multi-day spans, midnight
rollover, device-clock changes, DST gaps/folds, business hours/closures/lead time,
resource concurrency and adjacent bookings, subsidiary isolation, authorization,
stale edits, idempotent retries, recurrence uniqueness, history, cancellation,
in-app job suppression, offline fail-closed behavior, scoped export and responsive
light/dark views. Inventory, supporting documents, custom equipment and serial
selection regression suites are retained and rerun.

The full master brief still has outstanding work: end-on-date recurrence,
recurrence exceptions/holiday shifts, whole-series rescheduling, separate overnight
operating windows, rich day/week/resource-grid views, advanced scheduling KPIs,
external HR/certification checks, verified alternative slot search, external reminder
delivery/administrative retry UI and multi-stage escalation. Native pickers do not
visually disable each configured holiday; the backend enforces those policies.
Retrospective activity/correction forms remain their existing authorized workflows,
not a new universal retrospective scheduler. These are not marked complete.

Read-only local audit: 8 legacy assignments, 0 missing starts, 1 invalid date range,
3 potential date-only overlaps. They were flagged, not fixed or converted. Review
those records through authorized business workflows before migrating their precision.
Dependency installs also report existing npm audit advisories; this was not a full
security remediation or penetration test. No forced major dependency upgrades made.

## Migration, Deployment And Rollback

20261016_scheduling.sql adds eight tables: policies, policy history, series, events,
resources, event history, idempotency requests and jobs. Internal foreign keys and
scope/date/resource indexes are included. Existing tables/data are not rewritten.
The local helper saves a schema inventory before the additive migration; it is
restricted to localhost. Data audit is read-only.

Use the single consolidated release ZIP and its LIVE_DB_UPDATE.sql. Back up cloud
database/application/uploads first. Run SQL without --force, install the matching
server lockfile dependencies, preserve external upload paths and routing, then set
SCHEDULING_ENABLED=true and restart. Verify clock, login, scope, overlapping writes,
calendar and document access. Worker starts only with that flag. Deploy no local
Windows data paths or secret environment files. Cloud remains manual deployment.

Rollback: disable SCHEDULING_ENABLED, restore previous application builds and lock
files, restart CIMS and retain the additive tables/history/jobs. Do not drop issued
schedules or revert historical timestamps. Legacy validations remain available.
Keep the OS clock/time service healthy; do not correct time by modifying records.

Vite recommendation: root uses @vitejs/plugin-react 6.0.0 (Vite 8), Developers uses
4.7.0 (Vite 5), including its test configuration. No SWC plugin features were in
use. The supported React plugin replaces SWC rather than hiding its recommendation.

References: [Vite 8 and React plugin 6](https://vite.dev/blog/announcing-vite8.html),
[Temporal time-zone disambiguation](https://tc39.es/proposal-temporal/docs/timezone.html).

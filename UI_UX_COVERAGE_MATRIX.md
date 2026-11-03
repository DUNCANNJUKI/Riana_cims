# RIANA CIMS UI/UX Coverage Matrix

Date: 30 October 2026

“Shared” means the page inherits the updated global shell or shared primitives. “Direct” means page-specific layout was also modified. Functional status is limited to tests actually executed.

| Module | Route/Page | UI Updated | Responsive Tested | Functional Tested | Status |
|---|---|---:|---:|---:|---|
| Authentication | `/` unauthenticated | Preserved | 390, 1440 | Render only | Passed visual preservation |
| Dashboard | `/` / dashboard state | Direct | 390, 1440 mocked session | API contract unchanged | Passed rendered layout QA |
| Technician tasks | `technician-dashboard` state | Shared | Not live | Not executed | Shared coverage |
| Technician profile | `technician-profile` state | Shared | Not live | Not executed | Shared coverage |
| Clients | `clients` state | Shared | Not live | Not executed | Shared coverage |
| Installations | `installations` state | Shared | Not live | Serial QA script invoked | Shared coverage |
| Hardware & inventory | `inventory` state | Shared + primitive refinement | 390 light; 1440 light/dark mocked | Read-only typed fixture; dialog opened | Passed rendered layout QA; live mutations blocked |
| Installation progress | `progress` state | Shared | Not live | Not executed | Shared coverage |
| Users | `users` state | Shared | Not live | Not executed | Shared coverage |
| Finances | `finances` state | Shared | 390, 1366 fixture | Fixture save/reload | Passed fixture regression |
| Company settings | `company` state | Shared | Not live | Not executed | Shared coverage |
| Import | `import` state | Shared | Not live | Not executed | Shared coverage |
| Reports | `reports` state | Shared | Not live | Build only | Shared coverage |
| Analytics | `analytics` state | Shared | Not live | Not executed | Shared coverage |
| Audit logs | `audit-logs` state | Shared | Not live | Permission source reviewed | Shared coverage |
| My activity | `my-activity` state | Shared | Not live | Not executed | Shared coverage |
| Handover upload | `handover` state | Shared | Not live | Build only | Shared coverage |
| Assignments | `assignments` state | Shared | Not live | Not executed | Shared coverage |
| Calendar/scheduling | `calendar` state | Shared | Not live | 2 calendar tests | Passed automated range tests |
| Announcements | `announcements-management` state | Shared | Not live | Not executed | Shared coverage |
| Developers workspace | `/developers` | Direct | 1440 mocked session | 7 CRMS tests | Passed rendered layout QA |
| Help | `help` state | Shared | Not live | Not executed | Shared coverage |
| Public asset history | `/asset/:assetId` | Shared primitives | Not live | Build only | Build verified |
| Install app | `/install` | Shared primitives | Not live | Build only | Build verified |
| Feedback | `/feedback/:clientSlug/:token` | Shared primitives | Not live | Build only | Build verified |
| Feedback legacy | `/feedback/:token` | Shared primitives | Not live | Build only | Build verified |
| Password reset | `/reset-password` | Auth preserved | Not live | Build only | Build verified |
| Maintenance | `/maintenance` | Shared theme | Not live | Build only | Build verified |
| Not found | `*` | Shared theme | Not live | Build only | Build verified |
| CRMS overview | `/developers` | Direct | 1440 mocked session | CRMS tests | Passed rendered layout QA |
| CRMS pending | `/developers/pending` | Tabs/shared | Not live | Build only | Build verified |
| CRMS requests | `/developers/requests` | Tabs/shared | Not live | Build only | Build verified |
| CRMS new request | `/developers/requests/new` | Tabs/shared | Not live | Build only | Permission redirect preserved |
| CRMS request detail | `/developers/requests/:id` | Tabs/shared | Not live | Build only | Build verified |
| CRMS approvals | `/developers/approvals` | Tabs/shared | Not live | Build only | Permission redirect preserved |
| CRMS reports | `/developers/reports` | Tabs/shared | Not live | 6 PDF tests | Passed document tests |
| CRMS audit | `/developers/audit` | Tabs/shared | Not live | Build only | Permission redirect preserved |
| CRMS assignments | `/developers/assignments` | Tabs/shared | Not live | Build only | Build verified |
| CRMS users redirect | `/developers/users` | None required | N/A | Source reviewed | Redirect preserved |
| CRMS settings redirect | `/developers/settings` | None required | N/A | Source reviewed | Redirect preserved |
| CRMS notifications redirect | `/developers/notifications` | None required | N/A | Source reviewed | Redirect preserved |
| CRMS fallback | `/developers/*` | Shared theme | Not live | Build only | Build verified |

## Untested acceptance targets

Live authenticated validation remains outstanding for 320, 375, 430, 768, 1024, 1280, 1920, dark theme, 200% zoom, keyboard traversal, and permission-dependent business workflows. The 390/1440 checks used a local read-only mocked browser session, not production credentials or data. Unexecuted targets are not reported as passed.

## Requested viewport and theme matrix

| Target | Light | Dark | Evidence/status |
|---:|---|---|---|
| 320 | Blocked | Blocked | No authenticated QA account/environment |
| 375 | Blocked | Blocked | No authenticated QA account/environment |
| 390 | Pass, mocked primary surfaces | Blocked | Dashboard and login rendered; no live account |
| 430 | Blocked | Blocked | No authenticated QA account/environment |
| 768 | Blocked | Blocked | No authenticated QA account/environment |
| 1024 | Blocked | Blocked | No authenticated QA account/environment |
| 1280 | Blocked | Blocked | No authenticated QA account/environment |
| 1440 | Pass, mocked primary surfaces | Blocked | CIMS/CRMS and login rendered; no live account |
| 1920 | Blocked | Blocked | No authenticated QA account/environment |
| 200% zoom | Blocked | Blocked | Native browser zoom unavailable in the failed browser runtime |

## Role and authorization matrix

| Role | Visibility source reviewed | Live UI | Server permission | Subsidiary restriction |
|---|---:|---:|---:|---:|
| Super Admin | Yes | Blocked | Blocked | Blocked |
| Admin | Yes | Blocked | Blocked | Blocked |
| Management | Yes | Blocked | Blocked | Blocked |
| Finance | Yes | Blocked | Blocked | Blocked |
| Team Lead | Yes | Blocked | Blocked | Blocked |
| Developer | Yes | Mocked CRMS only | Blocked | Blocked |
| Sales | Yes | Blocked | Blocked | Blocked |
| User | Yes | Blocked | Blocked | Blocked |
| Inventory Officer | Yes | Blocked | Blocked | Blocked |

Blocked cells require non-production credentials and disposable data. Source review and mocked local storage do not prove backend authorization or subsidiary isolation.

## Loader coverage

| Surface | Widths/themes | Accessibility | Result |
|---|---|---|---|
| Startup loader | 320, 375, 390, 430, 768, 1024, 1440, 1920 | Single status region; title announced once | Passed Playwright render matrix |
| Reduced motion | 390 | Node, letter, and progress animation disabled | Passed computed-style verification |
| Official logo | Mobile and desktop | Decorative image hidden from duplicate announcement | Passed asset-path and visual verification |
| Borderless frame | Mobile and desktop | N/A | Passed, computed border width 0px |

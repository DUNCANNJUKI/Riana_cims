# RIANA CIMS Assistant Security and Privacy

## Security properties

- Authentication is required by the global `/api` policy.
- Server capabilities and existing tenant/subsidiary scoping remain authoritative.
- The assistant is read-only and has no destructive or autonomous tools.
- Sensitive technical requests and prompt-injection patterns are rejected before retrieval.
- Retrieved articles are allow-listed, versioned application guidance.
- Current-page data changes relevance only and cannot elevate permission.
- Lookup failures return generic errors without database or infrastructure details.

## Sensitive-data handling

Do not submit or retain passwords, OTPs, recovery codes, passkey material, access/session tokens, API keys, private keys, SMTP credentials, database credentials, or confidential file contents. Current conversation content is held in React memory and resets on user change or page lifecycle. Persistent assistant history is not enabled.

## Retention and deletion

There is no server-side assistant conversation store in this release. Consequently, there is no cross-session assistant history to retain, share, export, or delete. Existing direct-message conversations are a separate feature and are not used as assistant memory.

Before persistent memory is introduced, the design must define purpose limitation, field-level minimization, tenant and user keys, encryption, maximum retention, deletion APIs, audit policy, backup expiry, administrator boundaries, and migration rollback.

## Threat controls

| Threat | Control |
|---|---|
| Prompt injection | Explicit policy patterns; allow-listed deterministic retrieval; no instruction execution |
| Cross-tenant disclosure | Authenticated server context, capability checks, existing scoped lookup queries |
| Privilege escalation | Current module and client context never grant capabilities |
| Credential leakage | Sensitive-request refusal and no secret-bearing tools |
| Hallucinated workflow | Verified article catalog with implementation status and version |
| Poisoned retrieval | Catalog changes require code review and controlled release |
| Excessive retention | No persistent assistant conversation storage |

## Release gates

- Run policy, knowledge, and access-control tests.
- Run TypeScript/production build and ESLint.
- Verify representative roles and subsidiaries with non-production accounts.
- Validate mobile, keyboard, screen-reader announcements, dark theme, copy, and feedback controls.
- Review every changed article against actual navigation and server behavior.


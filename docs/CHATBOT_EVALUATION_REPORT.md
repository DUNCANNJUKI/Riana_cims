# RIANA CIMS Assistant Evaluation Report

Date: 3 November 2026

## Implemented evaluation coverage

- Backend-controlled assistant prompt and verified-information policy.
- Timezone-aware greeting and date/time behavior.
- Direct system guidance and concise-answer limits.
- Missing, found, denied, unavailable, and failed record retrieval.
- Permission-filtered knowledge retrieval.
- Prompt-injection and credential-request refusal.
- Current-conversation record and knowledge follow-ups.
- Technician-expense-only installation budget guidance.
- Installation creation navigation and ordered steps.
- General-knowledge rejection and unsupported-claim handling.
- Server effective-capability rules, including Management write denials and extra grants.

## Automated results

`npm run test:assistant`: 27 passed, 0 failed.  
`npm run build:all`: CIMS production build passed; CRMS production build passed.  
`npm run lint`: 0 errors and 386 pre-existing repository warnings.  
Targeted changed-file ESLint: 0 errors; one existing `any` warning in `src/pages/Index.tsx`.

## Loader visual validation

Because the in-app browser sandbox failed with `CryptUnprotectData 2148073483`, installed Playwright Chromium rendered a local component fixture using the production component markup, stylesheet, and official logo.

- Desktop: 1440 × 900, no horizontal overflow.
- Mobile: 390 × 844, no horizontal overflow after correcting the content box model.
- Reduced motion: logo and node animations disabled; SVG signal particles hidden.
- Status and progress semantics: `role=status`, polite live region, atomic message, and indeterminate `role=progressbar` verified.
- Reference comparison: branding, topology, centered composition, background, whitespace, title, status, and progress treatment preserved; logo/network scale increased modestly as requested.

## Remaining acceptance gates

- Authenticated browser validation of the assistant widget requires authorized non-production role and subsidiary accounts.
- Physical passkey, authenticator, camera, microphone, speaker-routing, and screen-sharing troubleshooting require representative devices and browser permissions.
- Feedback ratings are session-local and not persisted until retention and privacy controls are approved.
- Persistent conversation memory is intentionally excluded; current-session context is bounded and user-scoped.
- Deterministic retrieval should be re-evaluated if the verified article catalog grows enough to require semantic search.


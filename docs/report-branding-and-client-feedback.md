# Report branding and implementation feedback

## Scope and cause

The signed completion PDF used a separate unbranded renderer. Hardware inventory/history and technician budget PDFs also bypassed the e-handover document helpers. Developer PDFs used fixed text coordinates that could overrun the footer when descriptions, modules or approval notes were long. Mobile confirmation tabs could overlap, and landscape watermarks could extend into the header.

## Document standard

`server/services/documentBranding.mjs` is the shared, I/O-free drawing module for browser and API documents. It holds the RIANA/MAREZI identities, page layout, centered header/logo, continuation header, footer and watermark bounds. Browser wrappers remain in `src/utils/pdfWatermark.ts`; API asset loading remains in `server/services/completionDocumentBranding.js`.

- RIANA uses the existing transparent mark, teal header, official grayscale watermark and branded footer. The default header now matches the e-handover's 48 mm header.
- MAREZI retains the approved letterhead and confidential footer. Signed completion branding follows the client's or responsible Account Manager's subsidiary, rather than whichever staff member downloads it.
- The first-page content starts at 58 mm and continuation content at 40 mm. Tables reserve 45 mm at the bottom. Landscape watermarks stay in the body and footer artwork retains a bounded size.
- Generic reports, performance, installation exports and e-handover continue through their existing shared helpers. Hardware inventory/history, technician budgets, developer request/completion/summary and signed client completion now use the same standard.
- Developer descriptions, affected modules, approval notes and manual sign-off fields wrap and paginate through AutoTable. Legacy finance notes also paginate. Existing data, amounts, audit timeline scope and manual sign-off fields are retained.
- Verified completion PDFs retain the actual uploaded signature or explicit OTP attestation, declaration, acceptance reference and optional feedback. Additional prepared-report fields (dates, outstanding items and comments) are included when present. A missing signature still fails visibly.
- CSV/XLSX exports and asset/thermal QR labels retain their existing formats. They are data exports and physical labels rather than branded report pages.

## Client guide: feedback after implementation

1. The responsible Account Manager confirms implementation and sends the existing completion review link by email/SMS.
2. The client opens the review link (also reachable from request tracking) and reviews the delivered work.
3. If satisfied, the client selects **Accept & Confirm Completion**, optionally chooses a 1-5 satisfaction rating and enters up to 2,000 characters of comments.
4. The client supplies their name/designation and confirms the authority declaration, then verifies by OTP or submits their e-signature.
5. Feedback and acceptance are saved together in the existing transaction. Successful verification closes the request, downloads the branded signed report and displays the confirmation/feedback on review, tracking and the authorized staff request detail.

Feedback is optional and is collected during verified confirmation. Once accepted, that confirmation record is read-only; this release does not introduce a separate survey or unauthenticated feedback-edit endpoint. Clients with incomplete work should use **Request Further Changes** or **Raise Concern** instead of confirming completion. Those existing actions preserve the correction/dispute workflow.

The review page now explains this process before the action buttons. The dialog labels both fields as optional, explains the rating scale and shows the comment limit. Compact OTP/e-signature tabs fit narrow mobile screens without changing their accessible names or behavior.

## Security and operations

No schema migration, authentication change, authorization change, provider setting or application route is required. Signed-report eligibility still requires an unexpired scoped review token or authenticated request access, the verified latest acceptance and no unresolved dispute. PDF responses remain `no-store`. API branding assets are fixed packaged filenames; request content cannot select arbitrary filesystem paths or remote URLs. Signature resolution remains behind the existing secure resolver.

The shared module stays under `server/services`, which is already included by the deployment packager and GitLab artifact rules; browser builds bundle its pure drawing functions. Deploy frontend and API together through the existing release process. Confirm the served release SHA before treating local changes as production changes.

If a signed report fails after confirmation, retry its download; rendering failure does not reverse committed acceptance. Check the packaged `dist`/`public` transparent mark, watermark/footer and MAREZI letterhead, plus access to the stored signature. Never replace missing signature evidence with invented handwriting.

Rollback consists of restoring the prior frontend/API release together. There are no database changes to roll back, and existing acceptances, feedback, closures and audit evidence must remain intact.

## Validation

Validation uses synthetic fixtures and disposable SQL schemas with notification providers stubbed. Coverage includes OTP/e-signature acceptance and feedback persistence, replay/access denials, closure and tracking, generated signed PDFs, RIANA/MAREZI branding, multi-page long content and portrait/landscape boundaries. Browser QA exercises the real review components at 320, 390, 768 and 1366 pixels; temporary screenshots and rendered PDFs are kept outside committed source. The Browser plugin is unavailable, so the existing Playwright workflow is used. Poppler is unavailable in this environment; the application's PDF.js renderer provides the visual review images.

Full regression tests, TypeScript and both production builds must pass for release. Browser fixtures do not establish live SMS/email delivery or production acceptance. Existing lint warnings in legacy finances and completion-review hooks are outside the changed behavior.

# RIANA CIMS Assistant Architecture

Last verified: 3 November 2026  
Knowledge version: `2026.11.03`

## Scope

RIANA Assistant is authenticated, read-only user guidance for CIMS and the integrated Developers/CRMS workspace. It does not execute business actions, modify records, expose implementation details, or replace server authorization.

## Request flow

1. The authenticated frontend sends a question, bounded conversation context, and the current module to `POST /api/chat/assistant`.
2. The global API policy validates the existing signed session before the route executes.
3. `chatbotPolicy.js` rejects requests for credentials, source code, private infrastructure, database details, hidden prompts, or access-control bypasses.
4. Record lookups use the existing server-side capability checks and scoped SQL lookup tools.
5. Guidance questions are matched against `chatbotKnowledgeBase.js`. Articles marked implemented are eligible only when the authenticated user satisfies their capability or role requirement.
6. The server returns concise guidance, up to three follow-up suggestions, and a minimal context object.

## Knowledge model

Each article has a stable identifier, module, title, implementation status, verified version, source description, search phrases, answer, optional ordered steps, permission requirement, and follow-up suggestions. Planned or unverified features are not present in the published catalog.

The current catalog covers:

- Installation creation, assignments, and progress.
- Technician-expense installation budgets.
- Hardware registration and serial generation.
- E-Handover and client feedback.
- Reports and exports.
- Developers/CRMS change requests.
- Chat, calls, devices, screen sharing, saved messages, and history preferences.
- Passwords, TOTP, recovery codes, passkeys, and device sessions.
- Scheduling and workload calendars.
- Administration and permission troubleshooting.

## Memory and privacy

Conversation messages remain in the current browser component only and reset when the authenticated user changes. The server receives only the current question and a bounded context object containing an entity reference/status/branch or knowledge article identifier/module. No cross-user or cross-subsidiary shared memory exists.

Passwords, OTPs, recovery codes, tokens, private keys, database credentials, and unnecessary personal data must never be placed in assistant context. The API limits questions to 1,000 characters. Persistent conversation storage is intentionally not enabled until retention, deletion, encryption, and audit requirements are approved.

## Authorization and tenant safety

- Knowledge filtering uses the server `hasCapability` implementation, not frontend menu visibility.
- Record tools receive the authenticated server user and apply capability and existing subsidiary scope.
- Restricted guidance is omitted rather than disclosed and then denied.
- Current-module context influences relevance only; it never grants access.
- Retrieved content and user messages are data, never executable instructions.

## Controlled knowledge updates

1. During a release, compare changed routes, modules, permissions, migrations, help content, and API behavior with the catalog.
2. Update only affected articles and retain stable article identifiers.
3. Verify navigation labels and steps against the rendered application and server authorization.
4. Update `VERIFIED_VERSION` and the article source metadata.
5. Run the chatbot knowledge, policy, access-control, frontend, and production-build checks.
6. Review unsupported-claim and permission-boundary evaluation cases.
7. Publish the catalog only with the same controlled application release.

Automatic publication from source-code text is prohibited. Conflicting or insufficient evidence must result in an uncertainty response or article removal until reviewed.

## Known limitations

- Retrieval is deterministic keyword scoring, not an external embedding or language-model service.
- Feedback controls are session-local UI signals and are not persisted pending an approved privacy/retention design.
- Persistent user preferences and conversation history are intentionally not stored.
- Live role, subsidiary, and device-workflow acceptance requires authorized non-production accounts and representative data.


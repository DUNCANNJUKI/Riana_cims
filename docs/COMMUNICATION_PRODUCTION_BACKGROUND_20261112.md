# Production video background recovery — 12 November 2026

## Findings and root cause

The affected origin is `https://rianacims.marezi.co`. The screenshot reports a WebAssembly error while selecting call backgrounds. The existing MediaPipe implementation, camera track ownership, sender replacement, audio, rotation and effect cleanup paths were reviewed before editing. The attached modernization brief was used as requirements context; the immediate repair preserves the existing module and interfaces.

**Confirmed live failure:** the document response sends `script-src 'self'` without WebAssembly permission. Chromium navigating to the actual production page rejected a minimal `WebAssembly.Module` with a CSP compilation error. Thus CSP is an actual execution blocker, not an inference from the application's generic error text.

Public requests returned:

| Resource | Observed result |
| --- | --- |
| `/` | HTTP 200; enforced CSP lacks `wasm-unsafe-eval` |
| `/api/health` | HTTP 200, `status: ok`, `release: unversioned`; same restrictive CSP |
| `/mediapipe/wasm/vision_wasm_internal.js` | HTTP 200, JavaScript MIME, 334,128 bytes |
| `/mediapipe/wasm/vision_wasm_internal.wasm` | HTTP 200, `application/wasm`, 14,603,354 bytes, valid WASM signature |
| `/models/selfie_segmenter_landscape.tflite` | HTTP 200, 250,177 bytes, valid TFLite signature |

The repository already contains a security policy with `script-src 'self' 'wasm-unsafe-eval'`. The live response does not match that policy. Without authenticated host inspection, the exact deployment component responsible—older running API or an overriding proxy/edge policy—remains unconfirmed. A Git push or HTTP 200 does not establish that the correction is deployed.

The narrow CSP keyword permits WebAssembly without enabling JavaScript eval. No `unsafe-eval`, external script origins, relaxed `connect-src`, or cross-origin isolation changes were added. See the [CSP specification](https://www.w3.org/TR/CSP3/) and [MDN policy reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy).

## Corrections

1. **Build/runtime consistency:** replaced the copy-only-if-missing build path. Vite now stages a matched SDK loader, WASM binary and segmentation model, identified by a content hash that also includes the SDK JavaScript bundle. Missing required source assets fail preparation rather than silently reusing old files.
2. **PWA version isolation:** new bundles reference `/mediapipe/wasm/runtime-<revision>/` for both runtime and model. Existing CacheFirst entries cannot match the new URLs. No authentication storage, application data or user caches are cleared. The runtime cache remains bounded; legacy runtime paths are refreshed for compatibility. The generated files are build artifacts rather than committed binaries.
3. **Accurate errors:** a failed minimal WebAssembly probe produces site-policy guidance. Other compiler/model/asset failures use a safe load-failure message; merely mentioning WebAssembly no longer causes the UI to blame browser security settings. The previous effect selection and camera/audio source ownership remain intact on initialization failure.
4. **Public release verification:** added `server/scripts/verify-communication-runtime.cjs`. It verifies every enforced document CSP, expected API SHA, current runtime manifest, asset hashes/lengths, JavaScript/WASM MIME and binary/model signatures. HTML fallbacks and mismatched assets fail. It is read-only and requires no account credentials.
5. **GitLab checks:** added an independent browser QA job and a read-only `production_communication_check`. The latter is advisory because it checks the currently deployed release before the manual deployment. The deployment job runs the public verifier as a required final check. Production deployment remains manual and retains existing backup, schema, passkey-readiness and managed-process checks.

Principal files: `vite.config.ts`, `scripts/build-production.cjs`, `scripts/call-background-assets.cjs`, its declaration/test, `src/utils/callVideoBackground.ts`, `src/utils/callBackgroundError.ts` and test, `src/components/chat/ChatModule.tsx`, `src/vite-env.d.ts`, `scripts/call-background-browser-qa.cjs`, `server/scripts/verify-communication-runtime.cjs`, its HTTP/security tests, `.gitlab-ci.yml`, `package.json` and `.gitignore`.

## QA evidence

Flow: isolated production-compiled harness → select effect → actual MediaPipe segmentation/compositing → replacement video track → native WebRTC loopback receiver. The Browser plugin was unavailable; installed Playwright/Chromium was used. It exercised the actual application utility with synthetic camera frames and silent generated audio, without accessing a physical camera, account, database or signaling API.

| Check | Result |
| --- | --- |
| Page identity and meaningful content | Correct harness URL/title; both local and receiver video rendered |
| Framework overlay | None |
| Application console/page errors | None in the working-policy run |
| Blur, preset, custom, Off | Each completed; custom color verified from output pixels |
| Rotation | Output track became portrait after 90° rotation |
| Simulated camera replacement | New source and blur pipeline remained live |
| WebRTC video progress | Receiver decoded additional frames after every operation |
| Audio continuity | Original silent audio track remained live after every operation |
| Blocked-policy reproduction | Background initialization rejected; original camera and audio remained live |
| Viewports | Harness checked at 1366×900 and 390×844; no horizontal overflow at 390px |
| Screenshot review | Local/received custom background, mobile source replacement, blocked-policy fallback |
| Build artifacts | Main production bundle contains current runtime revision; both app/PWA builds and TypeScript passed |
| Regression tests | Default aggregate: **223 passed, 0 failed, 2 skipped** (frontend 26, API 169, CRMS 10, scripts 18); two opt-in database integrations remain skipped by the default command |
| Lint | Targeted files: zero errors, one existing recording-effect dependency warning |
| CI config | YAML parsed; browser and public diagnostic jobs present; deployment still manual |

MediaPipe logs CPU initialization at the browser error level and attempts optional telemetry to `odml.pa.googleapis.com`. The existing `connect-src 'self'` blocks that telemetry. QA accounts for those exact explained messages and rejects other console errors. The CSP was not expanded to allow telemetry.

Latest local evidence: `%TEMP%/riana-background-browser-xu93cq/` (`custom-desktop.png`, `mobile.png`, `blocked-policy.png`). Logs are in ignored `.runtime/call-background-browser.log`, `.runtime/background-final-tests.log` and `.runtime/background-final-build.log`. GitLab browser QA retains its logs/screenshots for seven days.

## Deployment and acceptance

After publishing the verified commit, use the existing GitLab manual `deploy` job for that commit. The job uses the configured host credentials and validates the backup before migrations; no `.env` files or credentials were edited for this repair. If a pre-existing passkey configuration or backup prerequisite fails, resolve that specific prerequisite without bypassing it.

The following read-only check can also run from the deployed application directory or GitLab build artifact:

```sh
node server/scripts/verify-communication-runtime.cjs --origin https://rianacims.marezi.co --release FULL_DEPLOYED_COMMIT_SHA
```

A successful release must return the same full SHA from public `/api/health` and pass the public document-policy and runtime-asset checks. If the document still sends the old CSP, inspect the running PM2 application's working directory/release and the reverse-proxy/Cloudflare headers. All enforced CSP policies must permit the narrow WebAssembly capability; adding another permissive header cannot override a restrictive one. Do not enable JavaScript eval globally or remove CSP.

Then verify an actual mobile/desktop call: blur, preset and custom backgrounds, sharp human foreground, camera replacement, rotation, audio continuity and remote reception. Also verify an installed PWA updates its document policy and bundle together. Reload/reopen after deployment as needed; indiscriminate storage clearing is not the fix.

At the time of investigation, the new public verifier correctly returned `ready: false` for document policy, release SHA and runtime manifest on production. Hosted CI results and actual deployment are not claimed verified. The available Git credential can push; prior pipeline API requests returned HTTP 403/401, and no authenticated server/browser session was available.

## Limits, impact and rollback

This repair does not certify physical-device performance, sharp person segmentation, actual two-device signaling/TURN transport, installed-PWA upgrades, all nine requested application viewports, or biometric enrollment. The screenshots are an isolated processing harness, not authenticated screenshots of the full call UI. The wider modernization checklist remains separate; this change does not rebuild or redesign the Communication module.

No database migration, permission, tenant scope, backend API, credential, `.env`, notification provider, recording policy or operational account was modified by this repair. Existing UI controls remain in place; only background error text changed. Content hashes add one immutable runtime/model copy to the release to prevent cache mixing; segmentation resolution/frame scheduling are unchanged.

Rollback by restoring the previous frontend/application release together. Keep existing operational data and the narrow WebAssembly policy. Retain required legacy assets and installed-client compatibility during rollback; background processing can be turned Off while camera/audio continue. Never drop passkey or communication tables as part of a frontend rollback.

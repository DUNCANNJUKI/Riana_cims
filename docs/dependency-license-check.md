# CI dependency license check

22 November 2026

The existing `license_check` job applied one restrictive allowlist to both application dependencies and development/operations tooling. It stopped at `BlueOak-1.0.0`, masking additional existing metadata/policy differences. The reported npm deprecation warnings originate in the license-checker tool's dependencies; they are not the exit-code cause.

The job now:

1. Pins the existing checker to `license-checker@25.0.1` for reproducibility; it does not add it to application dependencies.
2. Produces an inventory of every dependency, including development tooling.
3. Applies the shipped-library allowlist to the root project's production dependency graph with `--production`.
4. Adds the reviewed BlueOak-1.0.0, Zlib and MPL-2.0 identifiers used by the existing dependency set. All other allowed identifiers remain unchanged; unsupported production licenses still fail the command.
5. Keeps both JSON inventories as GitLab artifacts for seven days, including on failure. The existing advisory `allow_failure: true` setting is unchanged.

Review basis: [Blue Oak license text](https://blueoakcouncil.org/license/1.0.0), [SPDX identifier](https://spdx.org/licenses/BlueOak-1.0.0.html), [Zlib license](https://zlib.net/zlib_license.html), and [Mozilla's MPL guidance](https://www.mozilla.org/en-US/MPL/2.0/FAQ/). Keep upstream copyright/license notices and applicable source-availability information when distributing covered libraries. No upstream library source or license text was modified by this correction. This allowlist change does not relicense the application or approve arbitrary copyleft tooling.

The complete tooling inventory retains `pm2@7.1.2` (AGPL-3.0) and `@pm2/js-api@0.8.1` (reported by the checker as inferred `Apache*`; its installed license file identifies Apache 2.0). PM2 is already a development dependency and managed operational tool, not part of the root production dependency graph. It is not broadly added to the application's allowed licenses or hidden from the inventory. Review tooling distribution separately if it is bundled into an externally distributed product.

Validation: exact revised allowlist command passed with 267 root production packages; full inventory retained 781 packages; YAML parsing and whitespace checks passed. No runtime source, dependency manifest or lockfile changed. Deprecation warnings from the pinned legacy checker remain visible. A future checker migration should be evaluated separately rather than silently changing application dependencies during a production release.

The original license job was advisory, so this particular failure alone does not explain a blocked deployment. Other failed/pending jobs still require their own log/status inspection. A successful local command or repository push does not prove a GitLab pipeline or production deployment succeeded.

Rollback: revert only the license job changes in `.gitlab-ci.yml`. No application rebuild, server restart or database rollback is needed for this CI-only adjustment.

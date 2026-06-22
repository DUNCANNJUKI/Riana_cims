# Knowledge Base

## Login opens a blank page

Refresh once, then clear only RIANA site data and sign in again. If the problem persists, an administrator should check the client build, API health, and browser console. The Developers workspace must render natively and must not depend on an iframe URL.

## I cannot see a module

Module visibility follows your assigned module role. Ask an administrator to verify the mapping rather than changing the global role.

## A notification did not arrive

Check the in-app notification first, then confirm the recipient email/phone and workflow event. Administrators can inspect provider status and the audit log. Avoid repeatedly triggering the event because rate limits and duplicate suppression may apply.

## Handover preview/download fails

Confirm the document belongs to a client/installation you can access and that the file is an allowed PDF/JPG/PNG. Sign in again if the session expired. Administrators should verify that the database path maps to the protected upload store.

## Satisfaction differs from average rating

Average Rating is the mean on a 1–5 scale. CSAT is the percentage of valid responses rated 4 or 5. NPS is calculated separately from the 0–10 recommendation question.

## Backup is overdue

Open Company Settings → Data Management, inspect status and schedule, run an authorized manual backup, verify it, and check filesystem/database permissions. Never delete the last known-good backup while troubleshooting.

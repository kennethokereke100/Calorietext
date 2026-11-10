# Calorietext Supabase backend

This is independently written application code. The marketing website lives in
`calorietext/calorietext.github.io`. The original reference repository has not
been copied into this implementation.

## Current state

- Server-only tables for trainers, clients, messages, meals, and inbound events.
- All five tables have row-level security and no browser-role privileges.
- `sendblue-webhook` checks the Sendblue shared-secret header, recipient number,
  and pilot contact allowlist before accepting a message.
- Incoming content and contact numbers are encrypted with AES-256-GCM before
  storage. Random nonces are used per event. Duplicate message IDs are ignored.
- Ingestion defaults to disabled. No AI replies, reminders, or outgoing messages
  are enabled by this foundation. An AI queue consumer is still required.

## Configuration in Supabase Edge Function Secrets

Do not put secret values in this repository or the marketing website.

| Variable | Purpose |
| --- | --- |
| `SENDBLUE_WEBHOOK_SECRET` | At least 32 random characters; use the same value for the provider webhook secret. |
| `SENDBLUE_FROM_NUMBER` | Assigned Sendblue line in international format. |
| `PILOT_ALLOWED_NUMBERS` | Comma-separated verified test contacts, in international format. |
| `MESSAGE_ENCRYPTION_KEY` | 32 cryptographically random bytes represented as 64 hexadecimal characters. Preserve this key to decrypt retained events. |
| `CALORIETEXT_INGEST_ENABLED` | Keep unset/false until the processor is deployed and ready for an allowlisted phone test. |

Supabase supplies the project URL and backend database keys to the runtime.
The handler prefers the new `SUPABASE_SECRET_KEYS.default` key and has a legacy
environment-key fallback. No database key is shipped to the browser.

The next phase also needs `OPENAI_API_KEY`, `SENDBLUE_API_KEY`, and
`SENDBLUE_API_SECRET`. The website's Get Started link must stay in demo mode until
the complete incoming-message → AI → outgoing-message test succeeds.

## Development and deployment

```sh
node --test backend/tests/*.test.mjs
```

Run `tests/database.sql` through the SQL editor or migration tooling after schema
setup. It exercises server access, denied browser access, data constraints, and
client erasure inside a transaction that rolls back all synthetic test rows.

`supabase/schema.sql` is the initial schema snapshot. The hosted migration was
recorded with the name `calorietext_backend_foundation`; use Supabase migration
history to obtain the generated version. Do not blindly reapply the snapshot to
an existing project. Generate future migration files with the installed CLI's
`supabase migration new` command after checking its help.

Deploy the function from `supabase/functions/sendblue-webhook/index.ts` together
with `handler.mjs`. JWT verification is disabled specifically because Sendblue
authenticates using `sb-signing-secret`; the handler performs that verification
before reading any message body.

## Remaining work before a pilot

1. Set up Sendblue and verify the test phone.
2. Add provider secrets through Supabase's secret settings.
3. Implement a durable queue consumer, retries, spending limits, STOP handling,
   meal estimation, and outgoing replies. Validate remote media hosts before any
   image fetch or forwarding to the model; this receiver never fetches media.
4. Add the retention job. `expires_at` marks a 24-hour queue lifetime but does not
   delete data by itself. Completed/expired event payloads need scheduled cleanup.
5. Test text, a food photo, duplicate delivery, provider errors, and opt-out on a
   real phone before enabling the public message button.

No paid Supabase resources or paid branches are required for this foundation.

## Verification of the initial deployment

- All 10 webhook tests passed.
- Hosted database checks passed; all five tables remained empty afterward.
- Supabase's security advisor reported no findings.
- The deployed endpoint returned 405 for GET and 503 `setup_incomplete` for a
  POST without configured secrets, as intended.
- The performance advisor reported an informational
  [unused queue index](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).
  This index is retained for the future queue consumer; it has no workload yet.

These checks do not constitute an end-to-end Sendblue or AI conversation test.

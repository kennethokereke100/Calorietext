# Calorietext private texting pilot

The application backend is independently written and separate from the marketing
website in `calorietext/calorietext.github.io`. No reference-repository code or
provider credentials are included here.

## Implemented

- An authenticated Sendblue receiver accepts only the configured line and
  explicitly allowlisted test contacts. Duplicate delivery IDs share one queue item.
- Contact numbers and message content are encrypted with AES-256-GCM. Phone lookup
  uses a separate HMAC key. Browser roles cannot access any application table or RPC.
- An incoming webhook starts a background worker after its event is durably saved.
- The worker handles food photos, meal descriptions, general fitness questions,
  short conversation history, and estimated meal logging. `TODAY` reports stored
  totals for the UTC day. `HELP` explains the pilot, `STOP` pauses replies, and
  `START` resumes them. This is an AI assistant, not a real trainer.
- OpenAI structured replies use `gpt-5.4-mini`, with response storage disabled,
  at most 800 output tokens, and a database-enforced ceiling of 20 worker AI calls
  per UTC day across the pilot. Operator connection tests are separate from this quota.
- Photos are fetched only from the documented Sendblue CDN bucket, without
  redirects, with an 8 MB bound and JPEG/PNG/WebP signature checks. Other formats
  prompt the tester to resend or describe the meal. Real-phone photo delivery
  still needs validation, including the actual CDN URL used for inbound images.
- Queue leases serialize work. A send with an uncertain result is marked
  `uncertain` for review, not automatically repeated: the vendor send endpoint
  does not document an idempotency key. A successful API acceptance is not proof
  of delivery to a device.

## Deployment state

The database and `sendblue-webhook`, `process-messages`, and `connection-check`
functions are deployed, and Sendblue's receive webhook is configured with its
shared secret. OpenAI authentication, a small model call, structured
meal output, Sendblue authentication, and database access passed hosted checks.
Both `CALORIETEXT_INGEST_ENABLED` and `CALORIETEXT_REPLY_ENABLED` remain **false**.
Activation requires the owner's explicit approval. The public website button
remains in demo mode until a complete phone conversation succeeds.

`schedule.sql` is a reviewable proposal, **not an applied migration**. Recurring
worker calls, retention deletes, and the live flags await the owner's approval.
Without the retry job, failed or overlapping queue
work may wait for another webhook wake-up or a manual worker invocation.

## Private configuration

Save these in Supabase Edge Function Secrets, never in Git or the website:

| Name | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | API key for the linked OpenAI project. |
| `OPENAI_MODEL` | Optional; defaults to `gpt-5.4-mini`. |
| `SENDBLUE_API_KEY` | Sendblue API key ID. |
| `SENDBLUE_API_SECRET` | Sendblue API secret. |
| `SENDBLUE_WEBHOOK_SECRET` | Random shared secret, at least 32 characters, also set on the provider webhook. |
| `SENDBLUE_FROM_NUMBER` | Assigned Sendblue line in international format. |
| `PILOT_ALLOWED_NUMBERS` | Comma-separated verified tester numbers. |
| `MESSAGE_ENCRYPTION_KEY` | 32 random bytes as 64 hex characters. Preserve it to read existing encrypted records. |
| `PHONE_HASH_KEY` | Separate 32-byte HMAC key as 64 hex characters. Preserve it for stable lookups. |
| `CALORIETEXT_ADMIN_SECRET` | Separate random secret for operator and worker endpoints. |
| `CALORIETEXT_INGEST_ENABLED` | Incoming processing switch; currently false. |
| `CALORIETEXT_REPLY_ENABLED` | Outgoing reply switch; currently false. |

Supabase supplies the database URL and backend keys. New `SUPABASE_SECRET_KEYS`
keys are preferred, with a legacy environment-key fallback. No Supabase secret
is sent to OpenAI, Sendblue, or the browser.

## Verification and deployment

```sh
node --test backend/tests/*.test.mjs
```

All 23 Node tests passed. `tests/database.sql` verifies initial table permissions
and constraints. `tests/pilot-database.sql` verifies worker leases, send fencing,
daily limits, and private RPC access. Run the pilot database test only with the
pilot disabled and its queue empty; its synthetic changes roll back. Hosted
database checks passed, and security/performance advisors reported no findings.

`supabase/schema.sql` and `supabase/pilot.sql` are the applied initial snapshots,
recorded as `calorietext_backend_foundation` and `calorietext_private_pilot`.
Do not blindly reapply them. Use migration history for generated versions and
`supabase migration new` to generate future migration files.

Deploy each function with its relative dependencies under `functions/`.
JWT verification is disabled because the receiver validates `sb-signing-secret`
and operator endpoints validate `x-calorietext-admin-secret` instead.

`connection-check` requires the operator secret and returns status only.
The optional `?test_ai=true` and `?test_reply=true` flags run fixed, small model
checks that use API balance; they accept no custom user prompt and send no texts.

## Pending approval and real-phone test

1. Obtain approval to activate the private flags, recurring retries, and retention.
2. If approved, configure `calorietext_worker_url` and `calorietext_worker_secret`
   in Supabase Vault, then apply the reviewed `schedule.sql`. The retry job runs
   once per minute only when work is pending; the hourly cleanup removes queue
   records after their 24-hour expiry and usage counters older than 30 days.
3. Have the allowlisted tester send `hello`, a food photo, a meal description,
   `TODAY`, `STOP`, and `START`. Verify delivery, estimates, and stored totals.
4. Review any `uncertain` sends manually before retrying. The operator must check
   Sendblue for an existing send; blindly replaying can duplicate messages.
5. Keep the public website in demo mode until this test succeeds and public
   onboarding, ownership authorization, delivery reconciliation, and retention
   for longer-lived client/meal/message history are designed.

Completed queue payloads are cleared immediately, but the queue expiry column
does not remove failed payloads by itself. Until the cleanup job is approved,
those records remain stored. Provider-ID deduplication in the queue is bounded
by its retention period. This is a private pilot, not a public production launch.

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
- Replies use a relaxed texting tone, optional contextual emojis, and brief
  acknowledgments. Ordinary replies do not repeat the command menu. The same AI
  request can choose a reaction: 👍 for simple thanks, 👋 for greetings and
  friendly gestures, 😋 for ordinary hunger, 😔 for displeasure, 💪 for a logged
  meal estimated at 20g+ protein, 💧 for water, or 🙌 for a safe workout milestone.
  Saying "I'm hungry" or asking for food ideas does not create a meal entry.
  Displeasure takes priority over
  polite words or sarcasm. Simple standalone thanks and greetings have a short
  path without an AI call, including "what's up" and a standalone "whatsapp"
  greeting; questions about the WhatsApp app and other longer messages retain
  their full context. Neutral
  questions, uncertain inputs, and sensitive health or body-image contexts
  should get no reaction. Complaints also receive a helpful written response.
- Reactions are optional iMessage tapbacks, not extra text messages. Only a
  recognized iMessage transport and an unchanged primary UUID handle qualify;
  unknown/attachment-specific handles are skipped. There is no SMS/RCS tapback
  attempt. A reaction is attempted once after the text is durably completed;
  unsupported lines, failures, and timeouts cannot replay the text. Reaction
  callbacks and App Cards do not trigger the assistant. A crash can omit a
  cosmetic reaction; it is never retried. Emoji in reply text still work normally.
- iMessage typing dots start after contact and opt-out checks, alongside reply
  preparation (including photo processing), and stop when the reply is ready or
  processing fails. Start and stop calls have 1.5-second timeouts and cannot fail
  or replay the reply. Cleanup completes before releasing the queue lease, and
  a 60-second provider expiry bounds a crashed worker's indicator. There is no
  artificial typing delay, extra AI call, recurring job, or SMS/RCS indicator.
  The configured line accepted a short start/stop probe. Delivery is best effort
  and requires a recent iMessage conversation; a new contact may not see dots yet.
- Photos are fetched only from the documented Sendblue CDN bucket, without
  redirects, with an 8 MB bound and JPEG/PNG/WebP signature checks. HEIC/HEIF
  containers with supported HEVC brands are converted inside the backend to
  JPEG using the primary image, with a 13-megapixel limit before decoding and a
  1,536-pixel output long edge. Conversion copies no source EXIF/GPS metadata.
  Unsupported or oversized images get a screenshot fallback. The actual
  inbound camera-photo CDN and HEIC conversion passed a hosted operator check.
- Queue leases serialize work. A send with an uncertain result is marked
  `uncertain` for review, not automatically repeated: the vendor send endpoint
  does not document an idempotency key. A successful API acceptance is not proof
  of delivery to a device.

## Deployment state

The database and `sendblue-webhook`, `process-messages`, and `connection-check`
functions are deployed, and Sendblue's receive webhook is configured with its
shared secret. OpenAI authentication, a small model call, structured
meal output, Sendblue authentication, and database access passed hosted checks.
After the owner's explicit approval, both `CALORIETEXT_INGEST_ENABLED` and
`CALORIETEXT_REPLY_ENABLED` were enabled for the verified allowlisted tester.
The authenticated connection check confirmed both flags are **true** and all
three service connections pass on 2026-11-10 UTC. The database still enforces
20 worker AI requests per UTC day. The first real inbound greeting reached the
backend; after correcting empty successful REST insert responses, its retry
completed and Sendblue reported the reply delivered. The first real camera
photo arrived as HEIC and triggered the old format fallback. Automatic conversion
is now deployed and passed a hosted check with that same photo; a new photo
message subsequently produced a stored meal estimate. The line also accepted a
test 😊 reaction on the tester's recent thank-you message. API acceptance does
not confirm the reaction's appearance on the phone. At the owner's request,
the public website now opens Messages to the pilot line. Only approved,
verified contacts receive replies; sample website conversations remain demos.

`schedule.sql` is a reviewable proposal, **not an applied migration**. Recurring
worker calls and retention deletes still await the owner's approval; the latest
approval covered private replies only.
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
| `CALORIETEXT_INGEST_ENABLED` | Incoming processing switch; true for the approved private pilot. |
| `CALORIETEXT_REPLY_ENABLED` | Outgoing reply switch; true for the approved private pilot. |

Supabase supplies the database URL and backend keys. New `SUPABASE_SECRET_KEYS`
keys are preferred, with a legacy environment-key fallback. No Supabase secret
is sent to OpenAI, Sendblue, or the browser.

## Verification and deployment

```sh
npm ci --prefix backend --ignore-scripts
node --test backend/tests/*.test.mjs
```

All 40 Node tests passed, including a greeting through the REST adapter with
empty HTTP 201 insert responses, preservation of false RPC results, synthetic
HEIC conversion, pixel limits, corrupt inputs, and the authenticated media check.
Reaction tests cover transport/handle filtering, the protein estimate requirement,
completion ordering, failures without replay, opt-out, and ignored reaction callbacks.
Typing checks cover request ordering, idempotent cleanup, failure isolation,
and opt-out/service filtering.
The HEIC fixture is a generated solid-color image, not a tester's photo.
`tests/database.sql` verifies initial table permissions
and constraints. `tests/pilot-database.sql` verifies worker leases, send fencing,
daily limits, and private RPC access. Run the pilot database test only with the
pilot disabled and its queue empty; its synthetic changes roll back. Hosted
database checks passed, and security/performance advisors reported no findings.

`supabase/schema.sql` and `supabase/pilot.sql` are the applied initial snapshots,
recorded as `calorietext_backend_foundation` and `calorietext_private_pilot`.
Do not blindly reapply them. Use migration history for generated versions and
`supabase migration new` to generate future migration files.

Deploy each function with its relative dependencies under `functions/` and
`deno.json` as the import map. The two codec packages have exact version pins;
`package-lock.json` locks the local test dependencies. See `THIRD_PARTY.md`.
JWT verification is disabled because the receiver validates `sb-signing-secret`
and operator endpoints validate `x-calorietext-admin-secret` instead.

`connection-check` requires the operator secret and returns status only.
The optional `?test_ai=true` and `?test_reply=true` flags run fixed, small model
checks that use API balance; they accept no custom user prompt and send no texts.
`?test_media=true` accepts an authenticated, bounded JSON body containing one
trusted Sendblue `media_url`; it returns conversion status and image format
only. It runs no AI request, sends no message, and stores no photo.

## Real-phone test and pending recurring jobs

1. Private activation is approved and verified. Have the allowlisted tester
   first send `hello`, then a food photo after receiving the greeting.
2. Continue with a meal description,
   `TODAY`, `STOP`, and `START`. Verify delivery, estimates, and stored totals.
3. Review any `uncertain` sends manually before retrying. The operator must check
   Sendblue for an existing send; blindly replaying can duplicate messages.
4. Recurring retries and retention still need separate approval. If approved,
   configure `calorietext_worker_url` and `calorietext_worker_secret` in Supabase
   Vault, then apply the reviewed `schedule.sql`. The retry job runs once per
   minute only when work is pending; hourly cleanup removes queue records after
   their 24-hour expiry and usage counters older than 30 days.
5. The website's Messages links are enabled for the private pilot. Public
   onboarding, ownership authorization, delivery reconciliation, and retention
   for longer-lived client/meal/message history remain future work.

Completed queue payloads are cleared immediately, but the queue expiry column
does not remove failed payloads by itself. Until the cleanup job is approved,
those records remain stored. Provider-ID deduplication in the queue is bounded
by its retention period. This is a private pilot, not a public production launch.

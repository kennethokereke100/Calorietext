# Calorietext application backend

- This directory is the application backend in `kennethokereke100/Calorietext`.
- The public marketing website is separately maintained in `calorietext/calorietext.github.io`.
- Keep all provider credentials, encryption keys, and contact numbers out of source control.
- The hosted Supabase project uses the Free plan. Do not create paid branches or upgrades.
- Keep trainer/client/message/meal data inaccessible to browser roles until an ownership-based dashboard authorization model is implemented.
- The owner explicitly approved private pilot activation for the verified allowlisted tester, with a ceiling of 20 worker AI calls per UTC day. Both live switches are enabled and were verified through the authenticated connection check on 2026-11-10 UTC.
- Recurring retry/retention jobs remain uninstalled. Automatic approval review rejected those jobs; the later activation approval covered private replies only. Obtain explicit approval before scheduling retries or retention deletes.
- The public website's Get Started buttons now open Messages to the pilot line, as the owner requested after real phone testing. Backend access remains limited to approved, verified contacts. Report provider acceptance separately from device delivery.
- An uncertain send must be reconciled against Sendblue before manual replay; do not risk duplicate messages by blindly retrying it.
- Run `node --test backend/tests/*.test.mjs` after webhook changes and verify database permissions after schema changes.

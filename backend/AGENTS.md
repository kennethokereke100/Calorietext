# Calorietext application backend

- This directory is the application backend in `kennethokereke100/Calorietext`.
- The public marketing website is separately maintained in `calorietext/calorietext.github.io`.
- Keep all provider credentials, encryption keys, and contact numbers out of source control.
- The hosted Supabase project uses the Free plan. Do not create paid branches or upgrades.
- Keep trainer/client/message/meal data inaccessible to browser roles until an ownership-based dashboard authorization model is implemented.
- The inbound webhook is a foundation only: enable ingestion for allowlisted testers only after an AI queue consumer is deployed. Do not advertise live replies until a real phone test succeeds.
- Run `node --test backend/tests/*.test.mjs` after webhook changes and verify database permissions after schema changes.

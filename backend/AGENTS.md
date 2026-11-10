# Calorietext application backend

- This directory is the application backend in `kennethokereke100/Calorietext`.
- The public marketing website is separately maintained in `calorietext/calorietext.github.io`.
- Keep all provider credentials, encryption keys, and contact numbers out of source control.
- The hosted Supabase project uses the Free plan. Do not create paid branches or upgrades.
- Keep trainer/client/message/meal data inaccessible to browser roles until an ownership-based dashboard authorization model is implemented.
- The private pilot worker is deployed, but both live switches are off. Automatic approval review rejected flag activation and the proposed recurring retry/retention jobs. Obtain explicit owner approval for those actions; do not bypass the rejection with another mechanism.
- Keep the public website in demo mode until a real phone test succeeds. Report provider acceptance separately from device delivery.
- An uncertain send must be reconciled against Sendblue before manual replay; do not risk duplicate messages by blindly retrying it.
- Run `node --test backend/tests/*.test.mjs` after webhook changes and verify database permissions after schema changes.

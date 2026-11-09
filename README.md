# Calorietext

Calorie tracking that lives in your texts. This repository is the source of Kenneth's Calorietext project.

## Current version

A responsive marketing website modeled on the supplied Caltext reference, rebuilt with Calorietext branding. Includes a scroll-driven iPhone demo, three interactive feature tabs, optional sound, an accessible FAQ accordion, a sample messaging modal, QR navigation, and preview-specific privacy and terms pages. English landing routes: `/` and `/en`.

This is a website prototype. Sample conversations and nutrition values are illustrative. SMS, iMessage, photo analysis, voice calls, user accounts, payments, and persistent nutrition records are **not connected**. Get Started opens the interactive preview; it does not contact a phone number or start a subscription.

## Run locally

Requires Node.js 22.13+ and pnpm.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

```sh
pnpm exec tsc --noEmit
pnpm build
```

Built with React, TypeScript, Vinext, and Vite. The included Sites integration builds a Cloudflare Worker. `.openai/hosting.json` identifies the private hosted preview. Runtime tool configuration and credentials are excluded from Git.

## Project direction

The planned product gives trainers their own AI assistant and phone number: food-photo calorie estimates, equipment recognition and usage guidance, trainer-approved meal and workout plans, progress tracking, text conversations, and voice calls. Trainer-authorized voice likeness is a later capability. No backend provider has been configured in this version.

## Assets and design

- Visual reference supplied by the project owner: https://caltext-frkp1pbad-midday.vercel.app/en
- Interface and phone frame are newly implemented here; no source code from the Caltext repository is included.
- Inter and Plus Jakarta Sans are bundled under their SIL Open Font Licenses in `public/fonts/`.
- Salad photograph: https://images.unsplash.com/photo-1512621776951-a57141f2eefd (Unsplash).
- QR code opens this project's private website preview; it does not initiate a text.

The reference's customer count, testimonials, trial claims, social profiles, and placeholder phone number are not reused.

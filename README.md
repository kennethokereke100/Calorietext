# Calorietext website

The standalone Calorietext marketing website and interactive product demo.

**Public demo:** https://kennethokereke100.github.io/Calorietext/

The actual fitness application and its backend will be built separately. This repository does not run live AI, SMS, iMessage, phone calls, accounts, or payments.

## Website features

Responsive landing page, scroll-driven iPhone demo, three interactive feature tabs, optional sound, accessible FAQ accordion, sample messaging modal, QR navigation, and preview-specific privacy and terms pages. English landing routes: `/` and `/en`.

Sample conversations and nutrition values are illustrative. Get Started opens the demo; it does not contact a phone number or start a subscription.

## Development

Requires Node.js 22.13+ and pnpm. The pnpm version is pinned in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm exec tsc --noEmit
```

## GitHub Pages

```sh
pnpm build:pages
```

This builds a static Next.js export into `out/`. The default base path is `/Calorietext`, with trailing-slash routes so direct links to `/Calorietext/privacy/` and `/Calorietext/terms/` work on GitHub Pages. Fonts, images, scripts, navigation, and the QR code support the project URL. The output includes `.nojekyll`.

`.github/workflows/pages.yml` builds and publishes every push to `main`. The workflow can also be run manually from GitHub Actions. Repository **Settings → Pages → Source** is set to **GitHub Actions**. No custom domain or payment is required for the current public project demo.

For a future root-level custom domain, set `NEXT_PUBLIC_BASE_PATH` to an empty string in the build environment and regenerate `public/qr.svg` for the new address. Custom domain registration and DNS setup are separate steps.

## Original private preview

`pnpm build` retains the Vinext/Cloudflare build used by the original private preview. Its identity is preserved in `.openai/hosting.json`. GitHub Pages uses the separate `build:pages` command and does not need Sites credentials or a Worker. Provider credentials and local runtime state are excluded from Git.

## Assets and design

- User-supplied visual reference: https://caltext-frkp1pbad-midday.vercel.app/en
- The interface and phone frame are newly implemented here. No Caltext repository source is included.
- Inter and Plus Jakarta Sans: bundled SIL Open Font Licenses in `public/fonts/`.
- Salad photograph: https://images.unsplash.com/photo-1512621776951-a57141f2eefd (Unsplash).
- QR code opens the public GitHub Pages demo.

The reference's customer count, testimonials, trial claims, social profiles, and placeholder phone number are not reused.

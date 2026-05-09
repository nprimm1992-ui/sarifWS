# Sarif Consulting — site

Static Astro site deployed to **Cloudflare Pages** with a **Pages Function** for the contact API.

- **Contact / MailChannels / DNS:** see [docs/deploy-contact.md](docs/deploy-contact.md).
- **3D assets (GLB / Meshopt):** see [docs/glb-pipeline.md](docs/glb-pipeline.md) — `npm run optimize:glbs` after updating `public/*.glb`.
- **Dev:** `npm run dev` does not run Pages Functions. Test the contact API with `npm run build` then `npx wrangler pages dev dist` (see deploy doc).

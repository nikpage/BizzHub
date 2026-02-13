# BizzHub: Freelance Management & Bilingual Invoicing

BizzHub is a system for tracking clients, jobs, and work logs, with the ability to generate bilingual (English/Czech) invoices.

## Project Overview
- **Frontend**: Vanilla JavaScript, CSS (with Light, Dark, and Retro themes).
- **Backend**: Node.js serverless functions (Netlify/Cloudflare).
- **Database**: Supabase (accessed via authenticated proxy/batch functions).
- **Authentication**: Netlify Identity.
- **Localization**: Bilingual (EN/CS) support via a centralized dictionary.

## Build and Deployment
- **Install Dependencies**: `npm install` or `npm ci`
- **Build Project**: `npm run build`
- **Deploy (Cloudflare)**: `npx wrangler pages deploy dist --project-name=bizzhub`

## Coding Standards
- **Localization**: All UI text must use the translation helper `t('key')` from `lang.js`.
- **Database Access**: Always use the `database` or `db` object from `db.js`. Avoid direct Supabase calls; operations are proxied through serverless functions for security and user-scoping.
- **Security**: Serverless functions (`db-proxy.js`, `db-batch.js`) must verify Netlify Identity JWTs and enforce `user_id` filters on all queries.
- **State Management**: The application uses a central `state` object in `app.js` to manage clients, jobs, and invoices.
- **Theming**: UI styles are managed via CSS variables in `style.css` and applied using the `data-theme` attribute on the `<body>` tag.
- **Invoicing**: Invoice generation logic is handled in `app.js` (`createInvoiceFromJob` and `generateInvoice`), producing bilingual layouts.

## Key Files
- `app.js`: Main application logic and UI rendering.
- `db.js`: Database adapter with caching and batch request logic.
- `lang.js`: Translation dictionary and language helpers.
- `netlify/functions/`: Server-side proxy logic for Supabase.
- `style.css`: Centralized styling and theme definitions.

# Clear Italia - Cleaning Service Booking

A comprehensive one-page web application for booking cleaning services in Rome and Milan, Italy. Bilingual (English/Italian), mobile-first design, with full admin dashboard, Stripe payment authorization, and GDPR compliance.

This project contains a small Express backend plus a static frontend in `public/`. It is configured to run on Vercel using a serverless function for `/api/*` and static routes for the frontend.

## Features

### Frontend (User-Facing)
- **One-page design** with smooth scrolling navigation (Home, Services, FAQ, Contact).
- **Bilingual support**: English (default) and Italian with persistent language selection.
- **Mobile-first responsive design** with clean, modern UI, rounded cards, and friendly icons.
- **Hero section** with call-to-action and trust elements.
- **Services overview** grid showcasing all cleaning types.
- **Booking flow**: Multi-step form with service selection, city, hours, cleaners, date/time slots, contact info, and Stripe payment auth.
- **Payment integration**: Stripe Elements for secure card input, authorization (hold) without capture.
- **Confirmation page**: Displays pending status after booking.
- **FAQ section**: Common questions about payments and cancellations.
- **Contact section**: Email, WhatsApp link.
- **Privacy Policy**: Accessible via footer link.
- **Cookie consent banner**: GDPR compliant with accept option.

### Admin Dashboard
- **Bookings management**: View all bookings from localStorage, confirm/reject with status updates.
- **Calendar view**: Simple monthly calendar to block/unblock dates, prevent double bookings.
- **Locations management**: Add/deactivate cities (Rome, Milan, etc.).
- **Payments overview**: List of transactions with status, amount, Stripe IDs.
- **Customer management**: List of customers with contact info for manual communication.

### Technical Features
- **Payment Logic**: Stripe authorization (money on hold), admin confirms to capture or rejects to release.
- **Capacity-based bookings**: Multiple bookings allowed, but calendar blocks prevent overlaps.
- **Data persistence**: Uses localStorage for mock backend (bookings, blocked slots, language, cookies).
- **GDPR/PCI compliance**: No card data stored, cookie consent, privacy policy.
- **No double booking**: Blocked slots in calendar prevent conflicts.

## Project Structure
- `/`: Backend (Node.js, Express)
- `/public/`: Frontend (HTML, CSS, JS)
- `/api/`: Serverless functions for Vercel
- `/data/`: JSON data files

## Setup

### Local Development
1. In root directory: `npm install`
2. Configure `.env` with Stripe and email settings (see Environment Variables below).
3. `npm start` to run server on port 3000.

### Frontend (Static)
- Open `public/index.html` directly in browser for static serving.
- For development with live reload: In `public/` directory: `npm install` then `npm run dev` to serve on port 3001.

### Backend Features
- **Stripe Integration**: Creates PaymentIntents with manual capture for authorization.
- **Booking Management**: Stores bookings in memory (use DB in production).
- **Email Notifications**: Sends confirm/reject emails via Nodemailer.
- **Blocked Slots**: Manages calendar blocks to prevent double bookings.

### API Endpoints
- `GET /api/bookings`: Get all bookings
- `POST /api/bookings`: Create booking with payment
- `POST /api/bookings/:id/confirm`: Confirm booking and capture payment
- `POST /api/bookings/:id/reject`: Reject booking and cancel payment
- `GET /api/blocked-slots`: Get blocked dates
- `POST /api/blocked-slots`: Block a date
- `DELETE /api/blocked-slots/:date`: Unblock a date

## Technologies

- HTML5, CSS3, JavaScript (ES6+)
- Node.js, Express
- Stripe.js and Stripe API
- Nodemailer for emails
- Google Fonts (Roboto)
- localStorage / In-memory DB

## Usage

- **Booking**: Fill the form, enter card details (test mode), submit for authorization.
- **Admin**: Confirm/reject bookings, block calendar dates, manage locations.
- **Language**: Switch via buttons, persists across sessions.
- **Cookies**: Accept banner to hide it.

## Deploying to Vercel

1. Push the repo to Git (GitHub, GitLab, or Bitbucket).
2. Create a new Project in Vercel and import the repository.
3. In the Vercel Project Settings, add the following Environment Variables (Production/Preview/Development as needed):
   - `STRIPE_SECRET_KEY` — (optional) your Stripe secret key.
   - `SMTP_USER` — (optional) email account for sending notifications.
   - `SMTP_PASS` — (optional) password for the SMTP account.
   - `SMTP_HOST` — (optional) default `smtp.gmail.com`.
   - `SMTP_PORT` — (optional) default `587`.
   - `SESSION_SECRET` — random string used for session signing.
   - `ADMIN_PASSWORD` — optional admin password override.

Notes & runtime behavior
- Static frontend is served from `public/` via `vercel.json` routes.
- API routes are handled by a serverless function at `api/index.js`, which reuses the Express `app` from `server.js`.
- On Vercel the server writes runtime data to `/tmp` (configured in `server.js`). Files in the project root are read-only on Vercel build/runtime.

Quick local checks (PowerShell):
```powershell
# Run dev server (starts a listener locally)
npm install
npm start

# Vercel-like load check (does not start a listener)
$env:VERCEL=1; node -e "require('./server.js'); console.log('loaded OK')"
```

## Limitations

- Backend uses in-memory storage; data lost on restart.
- Stripe: Requires test keys; in production, secure secrets.
- Emails: Use Gmail or another service; configure properly.
- Calendar: Basic; no time slot blocking per day.

For production, add a database, secure environment, and deploy to a cloud service.

## Deploying to Render (recommended for this project)

Render is a good choice for this app because it supports both web services and managed Postgres. Important notes for a stable deployment:

1. Start Command: set to `npm start` (Render uses this by default if present in `package.json`).
2. Port: Render provides `$PORT`; `server.js` reads `process.env.PORT` so no change needed.
3. Persistent Storage: the app writes `data/*.json` by default. On Render you must either:
   - Attach a Persistent Disk and set the Environment Variable `DATA_DIR=/data` (or `RENDER_DATA_DIR`) so `server.js` will store data there; or
   - Use a managed database (Postgres) — preferred for production. The project already includes `pg` in dependencies and can be migrated.
4. Environment Variables to set in Render dashboard (Production + Staging as needed):
   - `STRIPE_SECRET_KEY` — your Stripe secret key
   - `STRIPE_WEBHOOK_SECRET` — Stripe webhook signing secret
   - `SMTP_USER`, `SMTP_PASS`, `SMTP_HOST`, `SMTP_PORT` — for Nodemailer
   - `ADMIN_PASSWORD` — optional admin password override
   - `DATA_DIR` — set to `/data` if you attached a Persistent Disk
5. Health check: set Render's health check path to `/api/health` (I added this endpoint for uptime and quick checks).
6. Stripe webhooks: configure Stripe to POST to `https://<your-service>.onrender.com/api/payments/webhook` and add the signing secret to `STRIPE_WEBHOOK_SECRET`.

Quick Render checklist after deploy:
- Verify `GET https://<your-service>.onrender.com/api/health` returns `status: ok`.
- Ensure `DATA_DIR` is set and writable if you rely on JSON files.
- Add `STRIPE_*` and `SMTP_*` env vars in the Render dashboard.

If you want, I can scaffold a Postgres migration (create `bookings` table and wire basic CRUD) so the app stops relying on JSON files and becomes robust on Render. This is recommended if you expect production traffic.

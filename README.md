# Clear Italia — Backend + Frontend

This project contains a small Express backend plus a static frontend in `public/`.
It is configured to run on Vercel using a serverless function for `/api/*` and static routes for the frontend.

Quick local checks

PowerShell:
```powershell
# Run dev server (starts a listener locally)
npm install
npm start

# Vercel-like load check (does not start a listener)
$env:VERCEL=1; node -e "require('./server.js'); console.log('loaded OK')"
```

Deploying to Vercel

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

If you'd like, I can add a GitHub Action to automatically deploy on push or help connect the repo to Vercel.
# Clear Italia - Cleaning Service Booking

A comprehensive one-page web application for booking cleaning services in Rome and Milan, Italy. Bilingual (English/Italian), mobile-first design, with full admin dashboard, Stripe payment authorization, and GDPR compliance.

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

## Files

- `index.html`: Main one-page site with all sections.
- `styles.css`: Responsive CSS with Roboto font, modern styling.
- `script.js`: Frontend logic for language, navigation, form, Stripe, localStorage.
- `admin.html`: Admin dashboard with tabs.
- `admin-styles.css`: Admin-specific styling.
- `admin-script.js`: Admin logic for tabs, bookings, calendar, etc.
- `server.js`: Node.js backend for Stripe and bookings.
- `package.json`: Node dependencies.
- `.env`: Environment variables (Stripe keys, email).
- `README.md`: This file.

## Project Structure
- `/`: Backend (Node.js, Express)
- `/public/`: Frontend (HTML, CSS, JS)

## Setup

### Backend
1. In root directory: `npm install`
2. Configure `.env` with Stripe and email settings.
3. `npm start` to run server on port 3000.

### Frontend
1. In `public/` directory: `npm install`
2. `npm run dev` to serve on port 3001 (for development).
3. Or open files directly in browser for static serving.

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

## Limitations

- Backend uses in-memory storage; data lost on restart.
- Stripe: Requires test keys; in production, secure secrets.
- Emails: Use Gmail or another service; configure properly.
- Calendar: Basic; no time slot blocking per day.

For production, add a database, secure environment, and deploy to a cloud service.
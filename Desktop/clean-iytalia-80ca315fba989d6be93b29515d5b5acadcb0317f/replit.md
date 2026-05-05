# CasaClean - Clear Italia Cleaning Service

## Overview
A cleaning service booking website for Italy. Users can book professional cleaning services in Rome and Milano. Features Stripe payment integration and multi-language support (Italian, English, Russian, Georgian).

## Project Architecture

### Tech Stack
- **Backend**: Node.js with Express
- **Frontend**: Static HTML/CSS/JavaScript served from `public/` directory
- **Database**: File-based JSON storage in `data/` directory
- **Payments**: Stripe integration (optional, falls back to simulation)
- **Email**: Nodemailer for email notifications

### Directory Structure
```
/
├── server.js          # Main Express server
├── public/            # Static frontend files
│   ├── index.html     # Main booking page
│   ├── admin.html     # Admin dashboard
│   ├── app.js         # Frontend JavaScript
│   ├── admin.js       # Admin JavaScript
│   ├── translations.js # Multi-language support
│   └── styles.css     # Styling
├── data/              # JSON data storage
│   ├── services.json  # Available cleaning services
│   ├── cities.json    # Service areas
│   ├── bookings.json  # Customer bookings
│   ├── admins.json    # Admin accounts
│   └── workers.json   # Worker profiles
├── api/               # API route modules
└── controller/        # Controller modules
```

### Server Configuration
- Server runs on port 5000
- Binds to 0.0.0.0 for Replit compatibility
- Cache control headers disabled for development

### Environment Variables (Optional)
- `STRIPE_SECRET_KEY` - Stripe API key for payments
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` - Email configuration
- `DATA_DIR` - Custom data directory path

## Recent Changes
- 2026-02-03: Initial Replit import
- 2026-02-03: Fixed missing `updateBookingFormLabels` function in public/app.js
- 2026-02-03: Configured workflow and deployment for Replit environment

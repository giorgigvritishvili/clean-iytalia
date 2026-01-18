# TODO List for Fixing Contact Info, Addon Restrictions, and Language Issues

## 1. Create Public Contact API Endpoint
- Add a route in `api/index.js` for `/api/contact` to serve contact info from `data/contact.json`.
- This allows the main site to load contact info dynamically instead of using hardcoded values.

## 2. Update Addon Filtering for One-Time Cleaning
- Modify `filterAddonsForService` in `public/app.js` to display "Not available with One-Time Basic Cleaning" note for disabled addons when "One-time Cleaning" is selected.
- Ensure users understand why addons are disabled and cannot select nothing.

## 3. Add Missing Georgian Translations
- Update `public/translations.js` to include Georgian translations for booking addons under 'ka'.booking.addons.
- Ensure all data-i18n attributes in the booking form have corresponding Georgian translations to fix language switching issues.

## 4. Test Changes
- Verify contact info updates on the main site after admin changes.
- Confirm addon restrictions and notes for "One-time Cleaning".
- Test language switching to Georgian during booking to ensure all elements update properly.

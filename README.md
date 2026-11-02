# The Ultimate Best Friend Experience

A multi-page friendship prank website with a Node.js/Express backend, SQLite persistence, an authenticated admin dashboard, quiz, application form, playful YES/NO challenge, verification animation, courtroom, certificate, and celebration page.

## Requirements
- Node.js 18 or newer
- npm

## Quick start

1. Extract the ZIP.
2. Open a terminal in the extracted project folder.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Copy `.env.example` to `.env`.
5. Change `SESSION_SECRET` and `ADMIN_PASSWORD` in `.env`.
6. Start the server:

   ```bash
   npm start
   ```

7. Open `http://localhost:3000`.

The SQLite database is created automatically at `database/friendship.sqlite`.

## Admin dashboard

Open `http://localhost:3000/admin.html`.

Default development credentials if you have not changed `.env`:

- Username: `admin`
- Password: `ChangeThisPassword123!`

**Change the password and session secret before exposing the site to the internet.** The admin account is initialized when the database is first created. If you change `ADMIN_PASSWORD` after initialization, update the admin password in the database or remove the local SQLite database and restart (this resets stored data).

## Features

- Home, application, quiz, YES/NO challenge, verification, benefits, courtroom, certificate, celebration, and secret surprise views.
- Application and quiz submissions stored in SQLite.
- Friendship approvals and unique certificate codes stored in SQLite.
- Basic interaction analytics.
- Admin-only statistics, recent activity, application/quiz review, CSV export, and data reset.
- Responsive layout and reduced-motion support.
- Certificate print dialog can save as PDF from the browser.

## Admin security

- Passwords are hashed with bcrypt.
- Admin routes require an authenticated session.
- Session cookie is HTTP-only and SameSite=Lax.
- API requests are rate-limited.
- Helmet security headers are enabled.

For production, configure HTTPS, a strong random session secret, secure cookie settings, a persistent database volume, backups, and a production-grade session store (the default Express MemoryStore is for local/demo use only).

## Deploying

Deploy to a Node.js host that supports persistent disk storage. Set environment variables from `.env.example`; do not upload `.env` to source control. Set `NODE_ENV=production`, use HTTPS, and ensure the `database/` directory is writable and persistent.

## Notes

- This is a playful consent-based experience. The NO button is cheeky, but the YES choice is voluntary; users can navigate away at any time.
- Optional display names are stored with application/approval records. Do not collect sensitive personal information.
- Sound is omitted by default so the site never unexpectedly plays audio.
- The app uses Google Fonts when online and falls back to system fonts offline.

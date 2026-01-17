# Party King

Mobile social app with matching, chat, and voice rooms. This workspace holds the
Flutter app, Firebase backend assets, and admin console scope docs.

## Project layout
- `app/` Flutter mobile app (iOS + Android)
- `backend/` Firebase rules, indexes, and backend notes
- `admin/` Admin console scope and requirements
- `docs/` Product specs and data model

## Quick start (local)
1. Install Flutter (stable channel).
2. Create a Firebase project and enable:
   - Auth: Phone + Apple
   - Firestore
   - Storage
3. Add Firebase config to `app/` (not committed).
4. Run the app:
   - `flutter pub get`
   - `flutter run`

## Web demo (no build)
1. Open `web_demo/index.html` in a browser.
2. Or run a local server:
   - `cd web_demo`
   - `python -m http.server 8000`
   - Visit `http://localhost:8000`
3. Single file for mobile:
   - `web_demo/party_king_demo_single.html`

## Notes
This repo contains a minimum working UI scaffold. Backend integration and admin
console implementation are planned in `docs/` and `backend/`.

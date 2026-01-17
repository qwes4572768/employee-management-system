# Firebase backend

## Services
- Auth: Phone + Apple
- Firestore
- Storage

## Setup outline
1. Create Firebase project.
2. Enable Auth providers:
   - Phone
   - Apple
3. Create Firestore and Storage.
4. Deploy rules and indexes:
   - `firebase deploy --only firestore:rules`
   - `firebase deploy --only firestore:indexes`
   - `firebase deploy --only storage`

## Security model
- Private profile data in `users/{uid}`
- Public profile data in `userPublic/{uid}`
- VIP access uses custom claims (`vip`) or `users/{uid}.vipActive`
- Admin access uses custom claims (`admin`)

## Notes
- Cloud Functions will be required for:
  - Match creation on mutual likes
  - Wallet updates and gift transactions
  - Level progression from voice time
  - VIP entitlement and billing

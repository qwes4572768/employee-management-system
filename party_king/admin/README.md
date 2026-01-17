# Admin console scope

## Modules
- Photo review queue (approve/reject)
- Reports list with status updates
- User moderation (block/unblock, view history)
- Room management (close rooms, mute users)
- Gift catalog management
- VIP entitlement and audits

## Roles
- Admin: full access
- Moderator: review + reports only

## Data sources
- Firestore collections: `photoReviews`, `reports`, `users`, `rooms`, `giftCatalog`
- Audit: `adminActions`

## Next steps
- Decide admin web stack (Flutter web vs React)
- Implement auth with Firebase custom claims

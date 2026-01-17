# Product Spec (MVP)

## Goals
- Launch a mobile social app with matching, chat, and voice rooms.
- Support a gift economy with points and VIP.
- Provide moderation and admin tooling for safety.

## Target market
- Region: Taiwan
- Language: zh-TW (UI localization to be added in the app layer)

## MVP features
### Auth and profile
- Phone SMS + Apple sign-in
- Profile: photos, nickname, age, gender, region, bio

### Matching
- Filters: gender, age range
- Daily like limit (configurable)
- Mutual like creates a match
- VIP can see who liked them

### Chat
- 1:1 chat with text and images
- Chat list with unread badge

### Voice rooms
- Public and private rooms
- Owner/admin can mute users
- Time-in-room increases player level (idle time counts)

### Gifts and points
- Points wallet
- Gift catalog
- Gift send history

### VIP
- See who liked me
- More daily likes

### Safety and moderation
- Photo review queue
- Block users
- Report users/rooms
- Admin actions log

## Core user flows
1. Sign up -> create profile -> upload photos
2. Browse -> like/skip -> match -> chat
3. Enter voice room -> earn level -> send gifts
4. Upgrade to VIP -> see likes -> more matches
5. Report/block -> moderation review

## Open questions
- Add 1-3 additional VIP benefits beyond the two confirmed items.
- Decide if chat should support voice notes and read receipts.
- Decide if room leveling is global per user or per room.

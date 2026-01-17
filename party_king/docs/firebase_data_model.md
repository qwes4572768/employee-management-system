# Firebase data model

## Collections

### users/{uid}
Private user profile and account flags.
- displayName, age, gender, region, bio
- photoUrls (array)
- createdAt, updatedAt
- vipActive (bool)
- dailyLikeLimit, dailyLikeUsed

### userPublic/{uid}
Public data for discovery and room display.
- displayName, age, gender, region
- photoUrl (primary)
- level

### userStats/{uid}
Aggregated stats and leveling data.
- voiceSeconds
- level
- lastLevelAt

### likes/{likeId}
One-way like record.
- fromUid, toUid, createdAt

### matches/{matchId}
Mutual like result.
- userIds (array of two uids, sorted)
- createdAt

### chats/{chatId}
1:1 chat container.
- participantIds (array of two)
- lastMessage, lastMessageAt
- createdAt, updatedAt

### chats/{chatId}/messages/{messageId}
Chat messages.
- senderId
- type ("text" | "image")
- content
- createdAt

### rooms/{roomId}
Voice room data.
- ownerId, title, type ("public" | "private")
- status ("open" | "closed")
- memberCount
- createdAt, updatedAt

### rooms/{roomId}/members/{uid}
Room membership and moderation state.
- role ("owner" | "admin" | "member")
- muted (bool)
- joinedAt
- voiceSeconds

### giftCatalog/{giftId}
Gift definitions.
- name, iconUrl, price
- active (bool)

### giftTransactions/{txId}
Gift send record.
- fromUid, toUid, roomId (optional)
- giftId, price
- createdAt

### wallets/{uid}
Points wallet.
- balance
- updatedAt

### reports/{reportId}
User or room reports.
- reporterId
- targetType ("user" | "room" | "message")
- targetId
- reason, detail
- status ("open" | "reviewing" | "closed")
- createdAt

### blocks/{blockId}
Block relationships.
- blockerUid, blockedUid
- createdAt

### photoReviews/{reviewId}
Photo moderation queue.
- userId, photoUrl
- status ("pending" | "approved" | "rejected")
- createdAt, reviewedAt

### adminActions/{actionId}
Audit log.
- adminUid, actionType, targetId, detail
- createdAt

## Index notes
Create indexes as needed for:
- likes by toUid + createdAt
- matches by userIds + createdAt
- rooms by status + updatedAt

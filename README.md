# Chat Backend API

## Auth

### POST /auth/register

```json
{ "uid": "firebase-uid", "email": "user@example.com" }
// 201 → { uid, email, access_token, refresh_token }
```

### POST /auth/login

```json
{ "uid": "firebase-uid" }
// 201 → { uid, email, access_token, refresh_token }
```

### POST /auth/refresh

Header: `Authorization: Bearer <refresh_token>`

```json
// 201 → { access_token, refresh_token }
```

### POST /auth/logout

Header: `Authorization: Bearer <access_token>`

```json
// 201 → { message: "Logged out successfully" }
```

---

## Profile

All endpoints require `Authorization: Bearer <access_token>`.

### POST /profile/create

Multipart form-data: `uid`, `firstName`, `lastName`, `userName`, `bio`, `location`, `avatar` (file, optional).

### GET /profile/id/:uid

Returns the profile for the given user UID.

### GET /profile/name/:name

Searches profile by username.

```json
// Found → { userExists: true, profile: {...} }
// Not found → { userExists: false }
```

### PATCH /profile/update/:uid

Multipart form-data. All fields optional: `firstName`, `lastName`, `userName`, `bio`, `location`, `avatar` (file).

---

## Chats

All endpoints require `Authorization: Bearer <access_token>`.

### POST /create

```json
{ "members": ["uid2"], "isGroup": false, "name": "...", "admin": "uid1" }
// 201 → chat object
```

Private chats (`isGroup: false`) are deduplicated — creating one between the same users returns the existing chat.

### DELETE /chats/:id

Deletes a chat. The requester must be a member.

```json
// 200 → { id: "...", deleted: true }
```

### PATCH /chats/:id/members

Add members to a group chat.

```json
{ "members": ["uid3", "uid4"] }
// 200 → updated chat object
```

---

## WebSocket (Socket.IO)

Connect to `/` with `auth: { token: "<access_token>" }`.

### Client → Server

| Event          | Payload                                    | Response (event)     |
|----------------|--------------------------------------------|----------------------|
| `getChats`     | `{ username: "uid" }`                      | `chats`              |
| `getUser`      | `{ username }`                             | `userSearch`         |
| `createChat`   | `{ members, isGroup, admin }`              | (broadcast) `chatCreated` |
| `deleteChat`   | `{ chatId }`                               | (broadcast) `chatDeleted` |
| `addMember`    | `{ chatId, members: [...] }`               | (broadcast) `memberAdded` |
| `joinChat`     | `{ chatId }`                               | `messages`           |
| `leaveChat`    | `{ chatId }`                               | —                    |
| `sendMessage`  | `{ chatId, text }`                         | (broadcast) `newMessage` |
| `markRead`     | `{ chatId }`                               | (broadcast) `messageStatus` |

### Server → Client

| Event            | Payload                         |
|------------------|---------------------------------|
| `chats`          | `Chat[]`                        |
| `userSearch`     | `{ userExists, profile? }`     |
| `chatCreated`    | `Chat`                          |
| `chatDeleted`    | `{ id, deleted: true }`        |
| `memberAdded`    | `Chat` (updated)                |
| `messages`       | `Message[]`                     |
| `newMessage`     | `Message + chatId`              |
| `messageStatus`  | `{ messageId, status }`         |
| `error`          | `{ event, message }`            |

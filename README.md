# Chat App API

A production-grade real-time messaging API built with **NestJS 11**, **PostgreSQL**, **Socket.IO**, **Redis**, and **TypeORM**. Features JWT authentication, group chats, message delivery tracking, online presence, Cloudinary image uploads, and BullMQ background job infrastructure.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [NestJS](https://nestjs.com/) 11 |
| Language | TypeScript 5.7 |
| Database | PostgreSQL 16 (via TypeORM with migrations) |
| Real-time | Socket.IO (Redis adapter for horizontal scaling) |
| Cache | Redis (optional, graceful fallback to in-memory) |
| Auth | JWT (access + refresh token rotation with blacklisting) |
| File Storage | Cloudinary |
| Background Jobs | BullMQ (queue infrastructure ready) |
| Testing | Jest (unit + e2e) |
| CI/CD | GitHub Actions (lint → typecheck → test → build) |

## Architecture

```
Client (Socket.IO)
    │
    ▼
ChatsGateway ──► ChatsService ──► TypeORM ──► PostgreSQL
    │               │
    │               ├── ProfileService ──► Cloudinary
    │               └── UserService
    │
    ▼
Server.emit()  ──► All connected clients
```

- **Monolithic NestJS application** with modular architecture (Auth, User, Profile, Chats, Cloudinary, Redis)
- **Socket.IO** handles all real-time communication — ChatList owns a single shared connection, ChatRoom only joins/leaves rooms
- **REST** endpoints for auth (register/login/refresh/logout), profile CRUD, and chat management
- **Optional Redis** for JWT blacklist persistence, Socket.IO pub/sub adapter, and BullMQ queue backend

## Features

### Authentication & Authorization
- Register/login with Firebase UID
- JWT access tokens (15 min) + refresh tokens (7 day) with rotation
- Token blacklisting on logout (Redis with in-memory fallback)
- Global `ValidationPipe` with whitelist and transform

### Real-time Messaging
- **Socket.IO** with automatic room management (`user:<uid>` for presence, `chatId` for chat rooms)
- Join/leave chat rooms, send/receive messages in real-time
- Cursor-based message pagination (50 messages per page)
- Message status tracking: `sent` → `delivered` → `read`
- Denormalized chat preview fields for fast sidebar queries
- Unread count tracking per user per chat

### Online Presence
- `userOnline` / `userOffline` events emitted on socket connect/disconnect
- Green dot displayed in chat list, chat header, group info panel, and profile view

### Profile Management
- Create and update user profiles with Cloudinary avatar uploads
- Search profiles by UID or username
- Profile view page at `GET /profile/name/:username`

### Group Chats
- Create private (dedup detection) or group chats
- Admin roles — only admins can delete groups or add members
- Group info panel with member list, names, avatars, and online status

## Getting Started

### Prerequisites

- Node.js 22+
- PostgreSQL 16
- Redis (optional, for production features)

### Environment Variables

Copy `.env` to `.env.production` and configure:

```env
# Database
DATABASE_URL=postgresql://postgres:pass1234@localhost:5432/chat_app
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=pass1234
DB_NAME=chat_app

# JWT
JWT_SECRET=your-jwt-secret
JWT_REFRESH_SECRET=your-jwt-refresh-secret

# Cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Redis (optional)
REDIS_URL=redis://localhost:6379

# App
FRONTEND_URL=http://localhost:5173
PORT=3000
NODE_ENV=development
```

### Install & Run

```bash
# Install dependencies
npm install

# Start database (Docker)
docker compose up -d

# Development
npm run start:dev

# Production build
npm run build
npm run start:prod
```

### Run Migrations

```bash
npm run migration:run
```

## API Endpoints

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | No | Health check |

### Auth

| Method | Path | Auth | Body | Description |
|--------|------|------|------|-------------|
| POST | `/auth/register` | No | `{ uid, email }` | Register user |
| POST | `/auth/login` | No | `{ uid }` | Login by Firebase UID |
| POST | `/auth/refresh` | Refresh | — | Rotate token pair |
| POST | `/auth/logout` | JWT | — | Blacklist current token |

### Profile

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/profile/create` | JWT | Create profile with avatar upload |
| PATCH | `/profile/update` | JWT | Update profile/avatar |
| GET | `/profile/id/:uid` | JWT | Get profile by UID |
| GET | `/profile/name/:username` | JWT | Get profile by username |

### Chats

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/create` | JWT | Create a chat |
| DELETE | `/chats/:id` | JWT | Delete a chat (admin-only for groups) |
| PATCH | `/chats/:id/members` | JWT | Add members to group chat |

### Swagger Docs

`GET /api/docs` — Interactive API documentation with Bearer JWT auth.

## Socket.IO Events

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `getChats` | `{ username }` | Fetch all user chats |
| `getUser` | `{ username }` | Search user by username |
| `createChat` | `CreateChatDto` | Create private or group chat |
| `joinChat` | `{ chatId }` | Join chat room |
| `leaveChat` | `{ chatId }` | Leave chat room |
| `loadMoreMessages` | `{ chatId, before? }` | Paginate older messages |
| `sendMessage` | `{ chatId, text }` | Send a message |
| `markRead` | `{ chatId }` | Mark messages as read |
| `deleteChat` | `{ chatId }` | Delete a conversation |
| `addMember` | `{ chatId, members }` | Add members to group |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `chats` | `ChatStructure[]` | Full chat list |
| `chatCreated` | `ChatStructure` | New chat created |
| `chatDeleted` | `{ id }` | Chat was deleted |
| `memberAdded` | `ChatStructure` | Member added to group |
| `newMessage` | `Message & { chatId }` | New message |
| `messages` | `Message[]` | Message history (joinChat response) |
| `moreMessages` | `Message[]` | Older messages (pagination) |
| `messageStatus` | `{ messageId, chatId, status }` | Status update |
| `userSearch` | `{ userExists, profile? }` | User search result |
| `unreadUpdated` | `{ chatId, unread }` | Unread count sync |
| `userOnline` | `{ uid }` | User came online |
| `userOffline` | `{ uid }` | User went offline |
| `error` | `{ event, message }` | Error response |

## Testing

```bash
# Unit tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:cov

# E2E tests
npm run test:e2e
```

## CI/CD

GitHub Actions runs on every push/PR:

1. **Lint** — ESLint with TypeScript rules
2. **Type check** — `tsc --noEmit`
3. **Test** — Jest unit tests
4. **Build** — `nest build`

All four stages must pass before merging.

## Project Structure

```
src/
├── auth/           # Authentication, JWT strategies, guards
├── chats/          # Real-time messaging, chat management, gateway
├── cloudinary/     # Cloudinary image upload integration
├── profile/        # User profile CRUD
├── user/           # User entity and service
├── redis/          # Redis client provider
├── queue/          # BullMQ queue configuration
├── app.module.ts   # Root module
└── main.ts         # Entry point, CORS, Swagger, ValidationPipe
```

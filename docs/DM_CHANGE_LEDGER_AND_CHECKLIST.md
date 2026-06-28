# DM Change Ledger and Checklist

Date: 2026-06-27
Project: NXQ Social
Scope: Mobile DM UX + backend direct messaging
Purpose: Prevent regressions when shipping new updates by tracking what is kept, removed, added, and still missing.

## 1) Current Verified State

### Backend (implemented)
- Direct message data model is present in Prisma:
  - Conversation
  - ConversationParticipant
  - DirectMessage
- New DM API endpoints are implemented:
  - GET /api/messages/conversations
  - POST /api/messages/conversations
  - GET /api/messages/conversations/:conversationId/messages
  - POST /api/messages/conversations/:conversationId/messages
  - POST /api/messages/conversations/:conversationId/read
- Hardening implemented:
  - Block checks before creating/sending messages
  - Transactional write path for send message

### Mobile (implemented)
- Messages tab exists and opens inbox.
- Inbox loads real conversation data from backend messages endpoint.
- Thread loads real persisted messages and sends persisted messages.
- Thread marks conversation as read.
- New conversation flow exists in inbox (username input + create + open thread).
- NXQ visual style pass is active on inbox and thread.

## 2) What Was Intentionally Rolled Back Earlier

- Voice-note recording path was removed from mobile for release stability.
- expo-av dependency was removed to avoid iOS native build break.
- Temporary voice-note UI path is not active in current release candidate.

Note:
- Some backend audio MIME support remains from earlier attempt.
- This is tracked for future cleanup/refinement, not a release blocker right now.

## 3) What Is New In This Update

- Fully persisted DM backend module and schema.
- DM service hardening against block relationships.
- Transactional message send consistency.
- DM unit tests added for:
  - blocked user prevention
  - existing conversation reuse
  - transaction send path
- Inbox composer now creates new conversations via backend endpoint.

## 4) Known Gaps (Missing / Next)

- No websocket/live push for incoming messages yet (poll/load on open only).
- No attachment sending in DM yet (text only).
- No delivery/read status indicators at per-message level yet.
- No dedicated mobile automated test suite for DM UI flows yet.
- Migration still must be deployed in each environment.

## 5) Validation Evidence (Latest)

Executed on 2026-06-27:
- Backend build: PASS
  - Command: npm run -s build (backend)
- Mobile typecheck: PASS
  - Command: npx tsc --noEmit (mobile)
- DM service tests: PASS
  - Command: npm test -- --runInBand src/messages/messages.service.spec.ts (backend)

## 6) Mandatory Release Checklist For DM Changes

Use this before each release:

1. Schema and migration
- [ ] Prisma schema updated and reviewed.
- [ ] Migration SQL created and committed.
- [ ] Migration deployed in target environment.

2. Backend safety
- [ ] Block checks verified.
- [ ] Transactional send path verified.
- [ ] Unit tests updated and passing.

3. Mobile integration
- [ ] Inbox loads real conversations.
- [ ] Thread loads and sends persisted messages.
- [ ] New conversation flow works by username.
- [ ] Empty/error states are user-safe.

4. Build and test gate
- [ ] Backend build passes.
- [ ] Mobile typecheck passes.
- [ ] DM tests pass.

5. Regression guard
- [ ] Compare this file against git diff before final submit.
- [ ] Update Sections 3 and 4 in this file with every DM-related change.

## 7) File Map (DM)

Backend:
- backend/prisma/schema.prisma
- backend/prisma/migrations/20260627193000_direct_messages/migration.sql
- backend/src/messages/messages.module.ts
- backend/src/messages/messages.controller.ts
- backend/src/messages/messages.service.ts
- backend/src/messages/messages.dto.ts
- backend/src/messages/messages.service.spec.ts
- backend/src/app.module.ts

Mobile:
- mobile/app/(tabs)/messages.tsx
- mobile/app/messages/[threadId].tsx
- mobile/app/(tabs)/_layout.tsx
- mobile/app/_layout.tsx

## 8) Update Log Template (Use Every Time)

### 2026-06-27 10:23 (Local Time)
- Change summary: Production iOS build and TestFlight submission executed for latest DM update.
- Files changed: none (release operation only).
- Intentional removals: none.
- Missing items after change: Apple processing pending completion.
- Tests run:
  - backend build
  - mobile typecheck
  - DM unit tests
- Result:
  - Build ID: d40d18db-4d84-4e02-adad-f1daec0966f9 (finished)
  - Build number: 57
  - Submission ID: 7beb01b3-f3cd-45ae-a781-89e89efb24ba
  - Submission status: uploaded to App Store Connect, waiting on Apple processing
- Risk notes: none at upload time; App Store processing time varies.
- Next action: verify build 57 appears in TestFlight processing list and then in Internal Testing.

### YYYY-MM-DD HH:MM
- Change summary:
- Files changed:
- Intentional removals:
- Missing items after change:
- Tests run:
- Result:
- Risk notes:
- Next action:

## 9) Pending Workspace Change Snapshot (2026-06-27)

Use this to avoid missing files when preparing the next release commit.

- Modified (DM-related and adjacent):
  - backend/prisma/schema.prisma
  - backend/src/app.module.ts
  - mobile/app/(tabs)/_layout.tsx
  - mobile/app/(tabs)/feed.tsx
  - mobile/app/(tabs)/reels.tsx
  - mobile/app/_layout.tsx
  - mobile/app/live-native.tsx

- Added (DM-related):
  - backend/prisma/migrations/20260627193000_direct_messages/
  - backend/src/messages/
  - mobile/app/(tabs)/messages.tsx
  - mobile/app/messages/

- Deleted (verify intent before release):
  - mobile/app/call.tsx
  - mobile/app/calls.tsx

Action before shipping:
- Verify deleted call routes were intentionally removed.
- Confirm all DM files above are included in final release commit.

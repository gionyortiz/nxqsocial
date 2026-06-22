# Build 30 Spec - AI Assistant

Objective: reduce creation friction while preserving authenticity and user control.

## In Scope
- AI Caption Assistant in Create:
  - Improve Caption
  - Shorten Caption
  - Funny Version
  - Professional Version
  - Generate Hashtags
  - Translate Caption
- AI Comment Assistant:
  - Reply Friendly
  - Reply Funny
  - Reply Professional

## Hard Safety Rules
- AI never auto-posts.
- AI never sends comments without explicit user action.
- Block suggestions containing harassment, hate, scams, sexual exploitation, or dangerous instructions.
- Keep user-editable output before publish.

## API Contract (Draft)
- `POST /ai/caption-assist`
  - input: `text`, `mode`, `language?`, `context?`
  - output: `suggestion`, `safetyFlags[]`, `tokensUsed`
- `POST /ai/comment-assist`
  - input: `text`, `mode`, `postContext?`, `language?`
  - output: `suggestion`, `safetyFlags[]`, `tokensUsed`

## UX States
- Idle
- Generating
- Suggested
- Safety-blocked
- Failed (retry)

## Analytics Events
- `ai_caption_opened`
- `ai_caption_generated`
- `ai_caption_accepted`
- `ai_caption_rejected`
- `ai_comment_opened`
- `ai_comment_generated`
- `ai_comment_accepted`
- `ai_comment_rejected`
- `post_published_after_ai`

## Success Metrics
- Assistant usage >= 25% eligible sessions.
- Suggestion acceptance >= 35%.
- Publish-after-assist uplift >= 10%.
- p95 generation latency <= 2.5s.

## Rollout Plan
- Phase 1: internal + staff accounts.
- Phase 2: 10% production traffic.
- Phase 3: 50%.
- Phase 4: 100% after safety/latency pass.

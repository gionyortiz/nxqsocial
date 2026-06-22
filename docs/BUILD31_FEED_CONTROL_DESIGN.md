# Build 31 Design - Feed Control

Objective: make recommendations understandable and user-steerable.

## In Scope (v1)
- Per-post controls:
  - More like this
  - Less like this
  - Why am I seeing this?
- Preference controls:
  - More Photography
  - Less Politics
  - More Friends
  - More Technology
  - More Local

## UX Requirements
- Controls must be reversible.
- Preference changes must affect feed on next refresh.
- "Why am I seeing this?" must provide at least one concrete reason:
  - follow graph
  - topic affinity
  - engagement similarity
  - locality relevance

## Backend Contract (Draft)
- `POST /feed/preferences`
  - input: weighted topic preferences, global suppressions
- `POST /feed/feedback`
  - input: `postId`, `signal` (`MORE_LIKE_THIS` | `LESS_LIKE_THIS`)
- `GET /feed/explanations/:postId`
  - output: explanation reasons and confidence labels

## Analytics
- `feed_more_like_this`
- `feed_less_like_this`
- `feed_why_this_opened`
- `feed_preferences_updated`
- `feed_post_hidden_after_feedback`

## Success Metrics
- Follow-up satisfaction after less-like-this >= 60%.
- Hide/report after feedback down >= 15%.
- Session depth +5% for users with active preferences.

## Launch Gating
- Must pass explanation quality QA.
- Must show measurable ranking impact from preference changes.

# Build 32 Design - Communities MVP

Objective: increase relevance and belonging with focused interest spaces.

## Seed Communities
- AI
- Cars
- Photography
- Gaming
- Technology
- Fitness
- Travel

## In Scope (MVP)
- Join / Leave community
- Community feed
- Top posts block
- Top creators block
- Basic discovery entry points from existing navigation (no new primary tab)

## Content Model (Draft)
- `Community`: id, slug, name, description, coverImage, rules
- `CommunityMembership`: userId, communityId, role
- `CommunityPostIndex`: postId, communityId, score, createdAt

## API Contract (Draft)
- `GET /communities`
- `GET /communities/:slug`
- `POST /communities/:slug/join`
- `DELETE /communities/:slug/join`
- `GET /communities/:slug/feed`
- `GET /communities/:slug/top-posts`
- `GET /communities/:slug/top-creators`

## Moderation Requirements
- Community-level report queue visibility.
- Fast removal path for flagged content.
- Community rules accessible before join.

## Success Metrics
- Join rate >= 20% of active users.
- D7 retention uplift for joiners >= 12%.
- Community revisit within 7 days >= 30%.

## Risks and Mitigations
- Cold-start empty feeds:
  - seed with curated starter posts and creators.
- Moderation gaps:
  - enforce trust/safety tooling parity with main feed.

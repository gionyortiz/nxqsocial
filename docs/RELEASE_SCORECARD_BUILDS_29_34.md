# NXQ Social Release Scorecard (Builds 29-34)

Purpose: keep roadmap disciplined, measurable, and trust-first.
Rule: each build has one primary thesis, clear launch gates, and explicit no-go criteria.

## Global Guardrails (All Builds)
- Build 28 remains frozen until Apple review result is final.
- No App Store metadata/screenshot/build replacement changes during Build 28 review.
- Do not add major out-of-scope categories (NFT/crypto/metaverse/VR/games).
- Ship only when pass criteria are met; otherwise slip scope or build date.

## Build 29 - Reliability
Primary thesis: publishing flow must feel dependable and clear.

In scope
- Delete own posts (feed).
- Delete own reels/videos.
- Owner-only delete controls.
- Delete confirmation + immediate UI removal.
- Upload progress + video processing states.
- Retry upload on failure.
- User-friendly upload error mapping.

Success metrics (targets)
- Publish success rate >= 99.0%.
- Median time from Publish tap to post live <= 12s (photo) and <= 45s (video).
- Upload-related support complaints down >= 40% from Build 28 baseline.

Pass criteria
- No P0/P1 crash in create/upload/delete flows.
- Retry path works for transient failures.
- Error messages map to actionable user guidance.
- No user-visible "BETA", "Coming Soon", "Preview", "Under Development" labels.

No-go criteria
- Reproducible publish failures > 1% on stable network.
- Delete flow leaves stale items in feed/reels.

## Build 30 - AI Assistant
Primary thesis: AI reduces creation friction without removing user agency.

In scope
- AI Caption Assistant: Improve, Shorten, Funny, Professional, Hashtags, Translate.
- AI Comment Assistant: Friendly, Funny, Professional.
- Assistive-only policy: AI suggests; user confirms.

Success metrics (targets)
- Assistant usage on create/comment surfaces >= 25% of eligible sessions.
- Suggestion acceptance rate >= 35%.
- Publish-after-assist conversion >= +10% vs no-assist cohort.

Pass criteria
- No auto-posting.
- Prompt safety filters active.
- Latency p95 <= 2.5s for suggestion generation.
- Full analytics events for request/success/accept/reject/publish.

No-go criteria
- Unsafe outputs not filtered in QA red-team set.
- Suggestion generation unavailable > 1% of requests.

## Build 31 - Feed Control
Primary thesis: users can actively shape recommendations.

In scope
- "More like this" and "Less like this" actions.
- "Why am I seeing this?" explanation panel.
- Topic preference controls (v1 sliders/toggles).

Success metrics (targets)
- "Less like this" action rate with follow-up satisfaction >= 60%.
- Hide/report-after-control actions down >= 15%.
- Session depth +5% for users who set preferences.

Pass criteria
- Preference updates apply within next feed refresh.
- Explanation panel always shows at least one concrete reason.
- Controls are reversible and resettable.

No-go criteria
- Preferences do not materially affect ranking.
- Explanations are generic/non-informative in QA spot checks.

## Build 32 - Communities MVP
Primary thesis: relevance and belonging increase retention.

In scope
- Seed communities: AI, Cars, Photography, Gaming, Technology, Fitness, Travel.
- Join/leave community.
- Community feed page.
- Top posts + top creators blocks.

Success metrics (targets)
- Community join rate >= 20% of active users.
- D7 retention for community joiners >= +12% vs non-joiners.
- Community feed revisit rate >= 30% within 7 days.

Pass criteria
- Join state is consistent across app surfaces.
- Community feed ranking stable and moderated.
- Basic discovery entry points from home/search/profile.

No-go criteria
- Empty-feeling communities without seeding plan.
- Moderation blind spots in community feeds.

## Build 33 - Creator Dashboard
Primary thesis: creators stay where performance is understandable.

In scope
- Metrics: Views, Reach, Watch Time, Followers Gained, Profile Visits, Top Post (week).
- Time window selector (7d/28d).
- Creator home summary card.

Success metrics (targets)
- Weekly active creators +15%.
- Posts per active creator +10%.
- Dashboard revisit rate >= 35% weekly.

Pass criteria
- Metric definitions documented and consistent across surfaces.
- Data freshness SLA documented (e.g., near-real-time + daily backfill).
- Empty-state education for new creators.

No-go criteria
- Metric inconsistencies between dashboard and post detail.
- Missing data for major creator cohorts.

## Build 34 - Trust Transparency
Primary thesis: moderation decisions must be understandable and appealable.

In scope
- Decision explanation for removals/restrictions.
- Report outcome visibility: accepted/rejected/action taken.
- Appeal initiation flow + status.

Success metrics (targets)
- Trust/helpfulness score on moderation messaging >= 4.2/5.
- Duplicate repeat reports on same item down >= 20%.
- Appeal resolution SLA adherence >= 95%.

Pass criteria
- Every moderation action maps to a reason code + human-readable explanation.
- Appeal flow reachable from every relevant decision surface.
- Audit trail retained for support/admin.

No-go criteria
- Unexplained enforcement states.
- Appeals submitted without trackable status.

## Launch Decision Template (Per Build)
- Build number:
- Primary thesis met? (Yes/No)
- Target metrics met? (Yes/No)
- P0/P1 open issues: count
- Apple-review risk check complete? (Yes/No)
- Final decision: Ship / Hold / Scope-cut
- Sign-off: Product / Engineering / QA / Trust-Safety

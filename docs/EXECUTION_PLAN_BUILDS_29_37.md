# NXQ Social Locked Execution Plan (Builds 29-37)

Status: locked
Change policy: no roadmap changes until Build 29 is completed and validated.

## Top Rule
Every build must increase retention or trust. If it does neither, do not build it.

## Global Constraints
- Build 28 stays frozen until Apple returns a final result.
- Do not submit Build 29+ while Build 28 is pending.
- No App Store metadata/screenshot edits while Build 28 is under review.
- No new navigation tabs until Communities is live (Build 32).

## Sequence (Do Not Reorder)
1. Build 29: Reliability
2. Build 30: AI Assistant
3. Build 30.5: AI Transparency Layer
4. Build 31: Feed Control
5. Build 32: Communities MVP
6. Build 32.5: Saved Collections
7. Build 33: Creator Dashboard
8. Build 34: Trust Transparency
9. Build 35A: Voice Rooms
10. Build 35B: Video Rooms
11. Build 36: Social Search
12. Build 37: Creator Monetization

## Monday Start Checklist
- [ ] Build 29: finish retry + error mapping + publish reliability validation.
- [ ] Build 30: complete AI Assistant spec and API contract.
- [ ] Build 31: complete feed control UX and ranking contract.
- [ ] Build 32: complete communities MVP design + seed strategy.

## Build 29 Exit Criteria
- Publish success rate >= 99%.
- Delete flows stable in feed/reels.
- Upload progress + processing states visible and understandable.
- Retry upload works for transient failures.
- Error mapping covers: network, file too large, unsupported format, timeout, still processing.

## Scope Discipline Rule
If a requested feature does not clearly improve trust, control, creator output, or retention, defer it to a later build.

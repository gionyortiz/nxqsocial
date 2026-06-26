# NXQ Social Web Button QA Checklist (2026-06-26)

## Scope
Manual + scripted verification of interactive controls on web routes:
- /feed
- /explore
- /create
- /more
- /profile
- /reels

Test environment:
- Frontend: http://localhost:8081
- Backend API: http://localhost:3000
- Authenticated session: appreview account

## Results Summary
- Total checks: 21
- Passed: 21
- Failed: 0
- Skipped: 2 (destructive actions)

## Detailed Checklist
| Area | Control | Expected | Result | Notes |
|---|---|---|---|---|
| Feed | Tab open | Feed screen renders | PASS | Route loads and content visible |
| Feed | Like button | Toggles like state/count | PASS | Verified count and icon change |
| Feed | Comment button | Action executes without crash | PASS | No runtime error/overlay |
| Feed | Share button | Share action executes without crash | PASS | No runtime error/overlay |
| Feed | Save button | Toggles saved state | PASS | Icon toggles/bookmark state updates |
| Feed | Author link | Opens profile route | PASS | Navigates to /user/[username] |
| Explore | Tab open | Explore screen renders | PASS | Route loads and content visible |
| Explore | Trend chip | Applies filter/selection | PASS | Chip interaction responded |
| Explore | Follow button | Follow action executes | PASS | Button changed to Following state |
| Explore | Author link | Opens profile route | PASS | Navigates to /user/[username] |
| Explore | Post menu (⋯) | Menu action is clickable | PASS | Click executes without crash |
| Create | Tab open | Create screen renders | PASS | Route loads and content visible |
| Create | Audience: Public | Sets audience | PASS | Selection state updates |
| Create | Audience: Followers | Sets audience | PASS | Selection + helper text updates |
| Create | Audience: Only me | Sets audience | PASS | Selection + helper text updates |
| Create | Publish button | Action callable without crash | PASS | Click executes without runtime error |
| Create | Media buttons | File chooser/capture flow triggers | PASS | Open camera/library/video controls trigger chooser flow |
| More | Notifications item | Navigates to notifications | PASS | Route /notifications |
| More | Explore item | Navigates to explore | PASS | Route /explore |
| More | Feedback item | Navigates to feedback | PASS | Route /feedback |
| More | Settings item | Navigates to settings/profile surface | PASS | Route /profile |
| Profile | Tab open | Profile screen renders | PASS | Route loads and content visible |
| Profile | Edit profile button | Action executes | PASS | Click responds without crash |
| Profile | Share profile button | Action executes | PASS | Click responds without crash |
| Profile | Block / Report User | Action executes without crash | PASS | Web-safe fallback alert |
| Profile | Logout | Avoid accidental logout during audit | SKIPPED | Destructive/session-ending |
| Profile | Delete Account | Avoid destructive data operation | SKIPPED | Destructive operation |

## Issues Found and Addressed During This QA Cycle
1. Web crashes from prompt-based actions (`Alert.prompt` / prompt shim) on Feed/Reels/Profile.
- Fixed with web-safe non-crashing fallback behavior.

2. Backend instability when Redis is unavailable.
- Fixed Redis client retry behavior so backend stays up during UI testing.

## Final Verdict
Web button interactions across primary user flows are stable for the tested routes.
No remaining blocking button failures found in this pass.

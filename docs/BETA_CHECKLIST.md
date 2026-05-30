# NXQ Social — Private Beta Checklist

A go/no-go checklist to run before inviting the first 10–25 beta users. Mark each
item as you verify it on the live site (`nxqsocial.com` / `api.nxqsocial.com`).

> Legend: `[ ]` not verified · `[x]` verified working · `[!]` issue found

---

## Pre-flight (do these first)

- [ ] Rotate the beta invite code (old `NXQ-BETA-R7K9M2` is considered public)
- [ ] Confirm whether beta gating is on (`NEXT_PUBLIC_BETA_MODE`) and the backend
      `BETA_INVITE_CODE` matches the new code
- [ ] Rotate any other potentially-exposed secrets (DB / Redis / admin)
- [ ] Enable GitHub **Dependabot alerts**, **Dependabot updates**, **secret
      scanning**, and **push protection** (repo → Settings → Security)
- [ ] Health check green: `GET /api/health/ready` →
      `{"status":"ready","checks":{"database":"ok","redis":"ok"}}`

---

## Authentication

- [ ] Register a new account (strong password rules enforced: 12+ chars, upper,
      lower, number, symbol)
- [ ] Register rejects a weak password with a clear message
- [ ] Login with correct credentials succeeds
- [ ] Login with wrong password shows a generic error
- [ ] Forgot password sends a reset email
- [ ] Reset password completes and the new password works
- [ ] Change password from Settings works
- [ ] Logout works

---

## Profile

- [ ] View own profile
- [ ] View another user's profile
- [ ] Edit profile (display name, bio, location, website) saves correctly
- [ ] Upload / change avatar
- [ ] Delete avatar
- [ ] Upload / change banner
- [ ] Delete banner
- [ ] Trust badge and trust score render correctly
- [ ] Stats (posts / followers / following) are accurate

---

## Content & feed

- [ ] Upload an image post
- [ ] Upload a video / reel
- [ ] Oversized or disallowed file type is rejected
- [ ] Post appears in the feed
- [ ] Delete own post
- [ ] Cannot delete another user's post (403)
- [ ] Like / unlike a post
- [ ] Comment on a post
- [ ] Reels tab plays videos

---

## Social

- [ ] Follow a user
- [ ] Unfollow a user
- [ ] Block a user (and confirm they disappear / cannot follow)
- [ ] Unblock from Settings → Blocked accounts
- [ ] Report a user / post

---

## Calls (Beta)

> Calls are gated by `NEXT_PUBLIC_CALLS_ENABLED` (default off → visible to ADMIN
> only). Flip the flag to `true` to roll out to all beta users. The Call entry
> carries a **Beta** badge in the nav and menu.

- [ ] Call entry shows for ADMIN (and for everyone when the flag is on)
- [ ] 1:1 voice call connects both ways
- [ ] 1:1 video call connects both ways
- [ ] Group video call (3+ participants) connects
- [ ] Incoming call rings (audio + vibrate) and can be accepted / declined
- [ ] Works in a mobile browser (iOS Safari + Android Chrome)
- [ ] Works across Wi-Fi ↔ mobile data
- [ ] International call test (e.g. NJ ↔ Dominican Republic)
- [ ] Camera / microphone permission prompts behave correctly
- [ ] Disconnect / reconnect recovers gracefully

---

## Verification & moderation (admin)

- [ ] Submit a verification request
- [ ] Start an ID verification (Stripe Identity) session
- [ ] Admin can review the pending verification queue
- [ ] A normal user is blocked (403) from admin verification routes
- [ ] Admin media review queue loads and approve/reject works
- [ ] A normal user is blocked (403) from admin media / reports routes

---

## Rate limiting (spot-check)

- [ ] Repeated failed logins eventually return `429`
- [ ] Rapid registrations are throttled
- [ ] Upload-URL creation is throttled under heavy use

---

## Cross-device / UX

- [ ] Desktop layout looks correct (feed, profile, settings)
- [ ] Mobile layout looks correct (bottom nav, profile, upload)
- [ ] Language picker switches the UI language
- [ ] Stories / people row scrolls (arrows on desktop, swipe on mobile)
- [ ] Incoming call rings (audio + vibrate) — Call is a Beta feature (see Calls section)
- [ ] No broken images or 404s on the main pages
- [ ] About / Privacy / Terms / Help pages load and look professional

---

## Go / No-Go

- [ ] All **Pre-flight** items complete
- [ ] No `[!]` blockers remaining in Authentication, Profile, or Content
- [ ] Health check green and error logs clean

**Decision:** ☐ GO for private beta ☐ NO-GO (list blockers below)

```
Blockers:
-
```

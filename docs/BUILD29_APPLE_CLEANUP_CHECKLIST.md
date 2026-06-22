# Build 29 Apple Cleanup Checklist

Owner: Mobile + QA + Release
Status: Draft (execution checklist)

## Release Guardrails
- [ ] Do not modify Build 28 metadata/build attachment while review is in progress.
- [ ] Do not submit Build 29 until Build 28 has final review outcome.
- [ ] Keep App Review notes factual and aligned to shipped behavior only.

## Apple 2.2 Risk Sweep (No Unfinished Labels)
- [ ] Remove user-visible "BETA" labels from mobile UI.
- [ ] Remove user-visible "Coming Soon" text from mobile UI.
- [ ] Remove user-visible "Preview Feature" text from mobile UI.
- [ ] Remove user-visible "Future Feature" text from mobile UI.
- [ ] Remove user-visible "Under Development" text from mobile UI.
- [ ] Verify no disabled/non-functional nav items are exposed.

## Build 29 Feature Scope
- [ ] Delete own post for photo posts.
- [ ] Delete own post for video posts.
- [ ] Delete own post for text posts.
- [ ] Owner-only delete visibility (post.author.id == current user.id).
- [ ] Delete confirmation dialog.
- [ ] DELETE /posts/:id API call.
- [ ] Remove deleted item from local feed/reels/profile state immediately.
- [ ] Show clear error alert on delete failure.

## Upload UX Hardening
- [ ] Show upload progress indicator for direct upload path.
- [ ] Show processing status for video moderation/transcode phases.
- [ ] Keep fallback upload behavior reliable when direct upload is unavailable.
- [ ] Verify large file behavior and user-facing errors are clear.

## UGC Safety Controls (Must Be Demonstrable)
- [ ] Terms acceptance before account creation.
- [ ] Report content flow reachable from posts/profiles.
- [ ] Block user flow reachable and functional.
- [ ] Delete account flow present and functional.
- [ ] Moderation response path exists and is operational.

## QA Verification Matrix
- [ ] Test on iPhone (latest iOS) fresh install.
- [ ] Test on iPhone upgrade from prior build.
- [ ] Test poor network conditions (timeouts/retries/errors).
- [ ] Verify no crash on cold start/warm resume/background return.
- [ ] Verify media upload for image and video.
- [ ] Verify delete own post from feed and reels.
- [ ] Capture reviewer evidence screenshots/video for all required controls.

## Submission Readiness
- [ ] Increment build number and archive cleanly.
- [ ] Confirm release notes do not mention unfinished features.
- [ ] Confirm privacy/terms/community-guidelines links are valid.
- [ ] Prepare App Review notes: where each UGC safety control is located.
- [ ] Final sign-off from QA + Product before submit.

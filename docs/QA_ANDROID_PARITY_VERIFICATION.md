# Android Parity Verification Checklist

**Build ID:** 2f7b34dd-61c2-4b2e-9bae-46fc418e2c8c  
**Date:** 2026-06-20  
**Target:** Verify moderation action parity between iOS beta and Android preview builds

---

## Pre-Test Setup
- [ ] Install APK on Android device or emulator
- [ ] Login with test account (credentials: `nxqbeta_{USERNAME}` / `P@ssw0rd_Test!`)
- [ ] Ensure device has internet connectivity
- [ ] Ensure backend API is reachable at `https://api.nxqsocial.com/api`

---

## Test 1: Feed Moderation Actions (Pre-existing, Verification)
**Screen:** `mobile/app/(tabs)/feed.tsx`  
**Intent:** Verify that Feed already had moderation actions in Android (regression check)

### Steps:
1. Navigate to Feed (default home screen)
2. Find a post from another user
3. Tap the 3-dot menu button
4. Verify menu appears with options:
   - [ ] "Report: Spam"
   - [ ] "Report: Harassment"
   - [ ] "Report: Nudity"
   - [ ] "Report: Scam"
   - [ ] "Block user" (destructive style, red)
   - [ ] "Cancel"
5. Tap "Cancel" to close

### Expected Behavior:
- Menu layout matches iOS beta appearance (3-dot icon visible)
- Report options are clearly labeled
- Block option is styled destructively (red)
- Tapping Cancel closes the menu without submitting

---

## Test 2: Reels Moderation Actions (NEW - Main Parity Fix)
**Screen:** `mobile/app/(tabs)/reels.tsx`  
**Intent:** Verify that Reels now has parity with iOS for non-owner posts

### Steps:
1. Navigate to Reels
2. Play through 2-3 videos until you reach a post not created by your account
3. Verify a 3-dot menu button is visible (white dots-horizontal icon)
4. Tap the 3-dot menu
5. Verify menu appears with options:
   - [ ] "Report: Spam"
   - [ ] "Report: Harassment"
   - [ ] "Report: Nudity"
   - [ ] "Report: Scam"
   - [ ] "Block user" (destructive style, red)
   - [ ] "Cancel"
6. Tap "Report: Spam"
7. Verify success alert appears with message: "Thanks for reporting. Our trust and safety team will review this report."
8. Dismiss alert
9. Return to Reels feed

### Expected Behavior:
- 3-dot menu button is visible on non-owner posts
- Menu displays all 4 report categories + block option
- Report submission triggers success alert
- UI remains responsive after report submission
- Post is not deleted (remains visible but possibly filtered from recommendation)

### Test 2b: Reels Block User
1. Navigate to Reels again
2. Find a post from a different user (not the one you reported)
3. Tap 3-dot menu
4. Tap "Block user"
5. Verify confirmation alert appears
6. Confirm the block
7. Verify success message appears
8. Return to Reels
9. Verify the blocked user's posts are no longer visible in feed

### Expected Behavior:
- Block action removes user's posts from Reels feed
- UI updates to reflect removed posts
- No error messages on block action

### Test 2c: Reels Owner Delete (Pre-existing)
1. Create a short video post (use Create screen)
2. Navigate to Reels
3. When your own post appears, verify 3-dot menu has RED trash icon (not white dots)
4. Tap 3-dot menu
5. Verify menu only contains "Delete" option
6. Tap "Delete"
7. Confirm deletion
8. Verify post is removed from feed

### Expected Behavior:
- Owner posts have distinct red trash icon (visual differentiation)
- Delete option is only shown for own posts
- Post removal is immediate

---

## Test 3: Explore Search Moderation Actions (NEW - Main Parity Fix)
**Screen:** `mobile/app/explore.tsx`  
**Intent:** Verify that Explore discovered posts have parity with iOS for moderation actions

### Steps:
1. Navigate to Explore
2. Either search for a user or scroll through discovered posts
3. Find a grid of posts from other users
4. Tap on one of the post preview images to expand it
5. Verify a 3-dot action button appears in the header area
6. Tap the 3-dot button
7. Verify menu appears with options:
   - [ ] "Report: Spam"
   - [ ] "Report: Harassment"
   - [ ] "Report: Nudity"
   - [ ] "Report: Scam"
   - [ ] "Block user" (destructive style, red)
   - [ ] "Cancel"
8. Tap "Report: Nudity"
9. Verify success alert

### Test 3b: Explore Block User
1. Return to Explore grid
2. Tap on a different user's post
3. Tap 3-dot menu
4. Tap "Block user"
5. Confirm block
6. Verify user's posts are removed from explore grid

### Expected Behavior:
- Explore posts have action buttons with 3-dot menu
- Menu options match Feed and Reels patterns
- Block action filters user content from explore results
- Report action submits successfully

---

## Test 4: Create Video UX (NEW - Secondary Fix)
**Screen:** `mobile/app/(tabs)/create.tsx`  
**Intent:** Verify that Android now has explicit video entry points (NOT just generic camera/library)

### Steps:
1. Navigate to Create screen
2. Verify media selection area shows the following button layout:
   - [ ] "Open camera" button (camera icon - generic mode)
   - [ ] "Pick from library" button (image-multiple icon - generic mode)
   - [ ] "Record video" button (record-rec icon - **NEW, explicit video capture**)
   - [ ] "Upload video" button (filmstrip-box-multiple icon - **NEW, explicit video upload**)
3. Tap "Record video" button
4. Verify camera opens in video recording mode (not photo mode)
5. Record a short video (5 seconds)
6. Verify the recorded video appears in the preview
7. Go back to Create screen

### Test 4b: Upload Video
1. Return to Create screen
2. Tap "Upload video" button
3. Verify file picker opens in video-only mode (should only show video files)
4. Select a video from device library
5. Verify video plays in preview on Create screen

### Test 4c: Create Post with Video
1. With a video preview loaded, enter a caption: "Parity fix test - Android"
2. Tap "Post" / "Share" button
3. Verify post submission succeeds with video attached
4. Verify post appears in Feed with video preview

### Expected Behavior:
- Four distinct media selection buttons are visible (not obscured)
- Record and Upload buttons are **clearly labeled** (not just icons)
- "Record video" opens camera in video mode
- "Upload video" filters to show videos only
- Video posts can be created and appear in feed

---

## Test 5: Terms & Privacy Compliance (Verification)
**Screen:** `mobile/app/register.tsx`  
**Intent:** Verify that Terms/Privacy links are displayed before account creation (Apple compliance)

### Steps:
1. Logout (if logged in)
2. Navigate to Register/Signup screen
3. Verify the following links are visible BEFORE creating account:
   - [ ] "Terms of Service" link
   - [ ] "Community Guidelines" link
   - [ ] "Privacy Policy" link
4. Verify checkbox: "I agree to Terms of Service and Community Guidelines"
5. Tap one of the links and verify it opens in browser to nxqsocial.com

### Expected Behavior:
- All three policy links are displayed upfront
- Links point to correct nxqsocial.com subpaths
- Compliance checkbox is mandatory before registration

---

## Post-Test Verification
- [ ] No console errors in React Native debugger
- [ ] No API 500 errors in backend logs
- [ ] All moderation actions execute without timeouts
- [ ] UI is responsive (no freezing or lag)

---

## Sign-Off
**Tester Name:** _______________  
**Date Tested:** _______________  
**Build ID Verified:** 2f7b34dd-61c2-4b2e-9bae-46fc418e2c8c  

**Result:** ☐ PASS ☐ FAIL  
**Notes:** ________________________________________________________________

---

## Screenshots Required for Apple Review
After passing QA, capture the following for review documentation:
1. Reels 3-dot menu with report/block options visible
2. Explore post with action button in header
3. Create screen showing four media buttons ("Open camera", "Pick from library", "Record video", "Upload video")
4. Report success confirmation alert
5. Block confirmation + feed update
6. Register screen with Terms/Community Guidelines/Privacy links

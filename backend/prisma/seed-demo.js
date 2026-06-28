// Plain-JS demo seeder — runnable inside the production backend container
// (which has @prisma/client and bcryptjs as runtime deps, but no ts-node).
//   node seed-demo.js
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// ── Helper: Download file from URL and save to disk ─────────────────────────
async function downloadAndSaveVideo(externalUrl, localPath) {
  return new Promise((resolve, reject) => {
    const protocol = externalUrl.startsWith('https') ? https : http;
    const dir = path.dirname(localPath);
    
    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // If file already exists and has content, skip (avoid re-downloading on re-seed)
    if (fs.existsSync(localPath)) {
      const stat = fs.statSync(localPath);
      if (stat.size > 1000) {  // Only skip if file is > 1KB (not an empty stub)
        console.log(`Video already cached (${stat.size} bytes): ${localPath}`);
        return resolve(localPath);
      }
      // File exists but is too small - delete it and retry
      fs.unlinkSync(localPath);
    }

    console.log(`Downloading video from ${externalUrl}...`);
    const file = fs.createWriteStream(localPath);
    let downloadedBytes = 0;
    let error = null;

    const request = protocol.get(externalUrl, { timeout: 30000 }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.destroy();
        fs.unlink(localPath, () => {});
        // Follow redirects
        return downloadAndSaveVideo(response.headers.location, localPath).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        error = new Error(`HTTP ${response.statusCode}: ${externalUrl}`);
        file.destroy();
        fs.unlink(localPath, () => {});
        return reject(error);
      }
      
      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
      });
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        const stat = fs.statSync(localPath);
        if (stat.size < 100) {
          const err = new Error(`Downloaded file too small (${stat.size} bytes): ${externalUrl}`);
          fs.unlink(localPath, () => {});
          return reject(err);
        }
        console.log(`✓ Downloaded ${stat.size} bytes: ${externalUrl} → ${localPath}`);
        resolve(localPath);
      });
    });
    
    request.on('error', (err) => {
      file.destroy();
      fs.unlink(localPath, () => {});
      console.error(`✗ Download failed: ${err.message} (${externalUrl})`);
      reject(err);
    });
    
    file.on('error', (err) => {
      fs.unlink(localPath, () => {});
      console.error(`✗ File write failed: ${err.message}`);
      reject(err);
    });
    
    request.setTimeout(30000, () => {
      file.destroy();
      fs.unlink(localPath, () => {});
      reject(new Error(`Download timeout: ${externalUrl}`));
    });
  });
}

function generateSeedPassword(prefix) {
  return `${prefix}-${Date.now()}-Aa1!`;
}

const isProduction = process.env.NODE_ENV === 'production';

const DEMO_USERS = [
  { username: 'maya_rivera', displayName: 'Maya Rivera',   bio: 'Photographer · chasing golden hour 🌅',          avatar: 1,  status: 'ID_VERIFIED',       trust: 96 },
  { username: 'leo_chen',    displayName: 'Leo Chen',      bio: 'Building things at NXQ ⚡ | coffee addict',       avatar: 12, status: 'HUMAN_VERIFIED',    trust: 88 },
  { username: 'aisha.k',     displayName: 'Aisha Khan',    bio: 'Travel ✈️ | food 🍜 | real moments only',        avatar: 5,  status: 'HUMAN_VERIFIED',    trust: 91 },
  { username: 'noah_design', displayName: 'Noah Bennett',  bio: 'Designer. Minimalist. Dog dad 🐕',                avatar: 8,  status: 'ID_VERIFIED',       trust: 94 },
  { username: 'sofia_makes', displayName: 'Sofia Martins', bio: 'Maker & ceramicist 🏺 | studio life',             avatar: 9,  status: 'HUMAN_VERIFIED',    trust: 85 },
  { username: 'fitwithjake', displayName: 'Jake Thompson', bio: 'Coach · move every day 💪 | family-safe content', avatar: 3,  status: 'BUSINESS_VERIFIED', trust: 90 },
  { username: 'green_thumb', displayName: 'Priya Nair',    bio: 'Plants 🌿 | slow living | no filters',            avatar: 10, status: 'HUMAN_VERIFIED',    trust: 87 },
  { username: 'mateo.eats',  displayName: 'Mateo García',  bio: 'Home cook sharing real recipes 🍳',               avatar: 13, status: 'HUMAN_VERIFIED',    trust: 83 },
];

const CAPTIONS = [
  'Golden hour never disappoints. Real photo, no edits. ✨',
  'Slow mornings and good coffee ☕ What are you working on today?',
  'Found this little spot on my trip — the food was unreal 🍜',
  'Less is more. Spent the weekend simplifying everything.',
  'New batch out of the kiln today 🏺 so happy with these glazes.',
  'No shortcuts. Consistency beats intensity every time 💪',
  'Repotted the whole shelf this weekend 🌿 swipe for the before.',
  'Sunday dinner with the family. Recipe in comments soon 🍳',
  'Reminder: the best moments are the unposed ones.',
  'Verified human, verified vibes. Glad to be part of NXQ ⚡',
];

// Public sample MP4s (reliable, hot-link-friendly CDNs) so the Reels feed +
// video posts have real, playable content for the demo.
const VIDEOS = [
  { url: 'https://download.samplelib.com/mp4/sample-15s.mp4',                                 caption: 'Caught this in 4K 🎥 sound on! #reels' },
  { url: 'https://media.w3.org/2010/05/sintel/trailer.mp4',                                   caption: 'POV: when the light hits just right ✨' },
  { url: 'https://download.samplelib.com/mp4/sample-20s.mp4',                                  caption: 'A little behind-the-scenes from today 🎬' },
  { url: 'https://test-videos.co.uk/vids/jellyfish/mp4/h264/360/Jellyfish_360_10s_1MB.mp4',   caption: 'Weekend adventures hit different 🌍' },
  { url: 'https://download.samplelib.com/mp4/sample-30s.mp4',                                  caption: 'Save this one for later 😄 #fun' },
  { url: 'https://media.w3.org/2010/05/bunny/movie.mp4',                                       caption: 'Turn it up 🔊 full send' },
  { url: 'https://download.samplelib.com/mp4/sample-10s.mp4',                                  caption: 'Real moments > perfect moments 💯' },
  { url: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4', caption: 'On the road again 🚗💨' },
];

// Dedicated account for Apple App Review (Guideline 2.1.0 — App Completeness).
// Provide APP_REVIEW_PASSWORD when preparing review so the reviewer credentials
// are deterministic and can be copied into App Store Connect.
const REVIEW_ACCOUNT = {
  email: 'appreview@nxqsocial.com',
  username: 'appreview',
  password: process.env.APP_REVIEW_PASSWORD,
  displayName: 'App Review',
  bio: 'Apple App Review demo account — full access to NXQ Social.',
  avatar: 7,
};

async function seedReviewAccount() {
  if (isProduction && !REVIEW_ACCOUNT.password) {
    throw new Error('APP_REVIEW_PASSWORD is required when NODE_ENV=production.');
  }

  const reviewPassword = REVIEW_ACCOUNT.password ?? generateSeedPassword('AppReview');
  if (!isProduction && !REVIEW_ACCOUNT.password) {
    console.warn(`\nWARNING: Using generated App Review password for non-production seed: ${reviewPassword}\nSet APP_REVIEW_PASSWORD to keep it stable.\n`);
  }

  const passwordHash = await bcrypt.hash(reviewPassword, 12);
  const reviewer = await prisma.user.upsert({
    where: { email: REVIEW_ACCOUNT.email },
    // Always reset the password so the reviewer login is guaranteed to work,
    // even if this seeder has been run before with a different value.
    update: { passwordHash, emailVerified: true, verificationStatus: 'ID_VERIFIED', trustScore: 95 },
    create: {
      email: REVIEW_ACCOUNT.email,
      username: REVIEW_ACCOUNT.username,
      passwordHash,
      role: 'USER',
      verificationStatus: 'ID_VERIFIED',
      trustScore: 95,
      emailVerified: true,
      profile: { create: { displayName: REVIEW_ACCOUNT.displayName, bio: REVIEW_ACCOUNT.bio, avatarUrl: `https://i.pravatar.cc/200?img=${REVIEW_ACCOUNT.avatar}` } },
    },
  });

  // Give the reviewer their own published post + reel so every screen has
  // content immediately on first login (no empty states during review).
  const photoCount = await prisma.post.count({ where: { authorId: reviewer.id, type: 'PHOTO' } });
  if (photoCount < 1) {
    await prisma.post.create({
      data: {
        authorId: reviewer.id,
        caption: 'Welcome to NXQ Social — verified humans, real moments. ⚡',
        type: 'PHOTO', visibility: 'PUBLIC', status: 'PUBLISHED', aiLabel: 'NONE',
        media: { create: {
          userId: reviewer.id, s3Key: 'demo/appreview-0.jpg', bucket: 'demo',
          url: 'https://picsum.photos/seed/appreview-0/900/900', mimeType: 'image/jpeg',
          size: 0, width: 900, height: 900, uploadStatus: 'PUBLISHED', moderationStatus: 'APPROVED', order: 0,
        } },
      },
    });
  }
  const videoCount = await prisma.post.count({ where: { authorId: reviewer.id, type: 'SHORT_VIDEO' } });
  if (videoCount < 1) {
    // Download video to local disk instead of hot-linking external CDN
    const videoFileName = `${require('crypto').randomUUID()}.mp4`;
    const videoPath = path.join(process.cwd(), 'uploads', 'videos', videoFileName);
    const localUrl = `/uploads/videos/${videoFileName}`;
    
    try {
      await downloadAndSaveVideo(VIDEOS[0].url, videoPath);
      
      await prisma.post.create({
        data: {
          authorId: reviewer.id,
          caption: 'A quick look at the Reels feed 🎥 sound on!',
          type: 'SHORT_VIDEO', visibility: 'PUBLIC', status: 'PUBLISHED', aiLabel: 'NONE',
          media: { create: {
            userId: reviewer.id, s3Key: 'demo/appreview-reel.mp4', bucket: 'demo',
            url: localUrl,  // ← Use local path, not external CDN
            mimeType: 'video/mp4',
            size: 0, width: 720, height: 1280, durationSec: 15, uploadStatus: 'PUBLISHED', moderationStatus: 'APPROVED', order: 0,
          } },
        },
      });
    } catch (downloadErr) {
      console.error('Failed to download review account video:', downloadErr.message);
      // Fallback: store external URL
      await prisma.post.create({
        data: {
          authorId: reviewer.id,
          caption: 'A quick look at the Reels feed 🎥 sound on!',
          type: 'SHORT_VIDEO', visibility: 'PUBLIC', status: 'PUBLISHED', aiLabel: 'NONE',
          media: { create: {
            userId: reviewer.id, s3Key: 'demo/appreview-reel.mp4', bucket: 'demo',
            url: VIDEOS[0].url,  // ← Fallback to external URL
            mimeType: 'video/mp4',
            size: 0, width: 720, height: 1280, durationSec: 15, uploadStatus: 'PUBLISHED', moderationStatus: 'APPROVED', order: 0,
          } },
        },
      });
    }
  }

  console.log(`App Review account ready: ${REVIEW_ACCOUNT.email} / ${reviewPassword}`);
}

async function main() {
  // Clean up old demo content (videos, posts, media) before seeding fresh
  console.log('Cleaning up old demo content...');
  await prisma.post.deleteMany({where: {type: 'SHORT_VIDEO'}});
  await prisma.mediaAsset.deleteMany({where: {s3Key: {contains: 'demo'}}});
  console.log('✓ Cleaned old posts and media');
  
  await seedReviewAccount();
  const demoPasswordEnv = process.env.DEMO_USER_PASSWORD;
  if (isProduction && !demoPasswordEnv) {
    throw new Error('DEMO_USER_PASSWORD is required when NODE_ENV=production.');
  }

  const demoPassword = demoPasswordEnv ?? generateSeedPassword('Demo');
  if (!isProduction && !demoPasswordEnv) {
    console.warn(`\nWARNING: Using generated demo user password for non-production seed: ${demoPassword}\nSet DEMO_USER_PASSWORD to keep it stable.\n`);
  }

  const passwordHash = await bcrypt.hash(demoPassword, 12);
  let posts = 0;

  for (let i = 0; i < DEMO_USERS.length; i++) {
    const u = DEMO_USERS[i];
    const user = await prisma.user.upsert({
      where: { email: `${u.username}@demo.nxqsocial.com` },
      update: {},
      create: {
        email: `${u.username}@demo.nxqsocial.com`,
        username: u.username,
        passwordHash,
        role: 'USER',
        verificationStatus: u.status,
        trustScore: u.trust,
        emailVerified: true,
        profile: { create: { displayName: u.displayName, bio: u.bio, avatarUrl: `https://i.pravatar.cc/200?img=${u.avatar}` } },
      },
    });

    const photoCount = await prisma.post.count({ where: { authorId: user.id, type: 'PHOTO' } });
    if (photoCount < 2) {
      for (let p = 0; p < 2; p++) {
        const seed = `${u.username}-${p}`;
        await prisma.post.create({
          data: {
            authorId: user.id,
            caption: CAPTIONS[(i * 2 + p) % CAPTIONS.length],
            type: 'PHOTO',
            visibility: 'PUBLIC',
            status: 'PUBLISHED',
            aiLabel: 'NONE',
            media: {
              create: {
                userId: user.id,
                s3Key: `demo/${seed}.jpg`,
                bucket: 'demo',
                url: `https://picsum.photos/seed/${seed}/900/900`,
                mimeType: 'image/jpeg',
                size: 0, width: 900, height: 900,
                uploadStatus: 'PUBLISHED',
                moderationStatus: 'APPROVED',
                order: 0,
              },
            },
          },
        });
        posts++;
      }
    }

    // One short-video reel per demo user
    const vid = VIDEOS[i % VIDEOS.length];
    const videoCount = await prisma.post.count({ where: { authorId: user.id, type: 'SHORT_VIDEO' } });
    if (videoCount < 1) {
      // Download video to local disk instead of hot-linking external CDN
      const videoFileName = `${require('crypto').randomUUID()}.mp4`;
      const videoPath = path.join(process.cwd(), 'uploads', 'videos', videoFileName);
      const localUrl = `/uploads/videos/${videoFileName}`;
      
      try {
        await downloadAndSaveVideo(vid.url, videoPath);
        
        await prisma.post.create({
          data: {
            authorId: user.id,
            caption: vid.caption,
            type: 'SHORT_VIDEO',
            visibility: 'PUBLIC',
            status: 'PUBLISHED',
            aiLabel: 'NONE',
            media: {
              create: {
                userId: user.id,
                s3Key: `demo/${u.username}-reel.mp4`,
                bucket: 'demo',
                url: localUrl,  // ← Use local path, not external CDN
                mimeType: 'video/mp4',
                size: 0, width: 720, height: 1280, durationSec: 15,
                uploadStatus: 'PUBLISHED',
                moderationStatus: 'APPROVED',
                order: 0,
              },
            },
          },
        });
        posts++;
      } catch (downloadErr) {
        console.error(`Failed to download video for ${u.username}:`, downloadErr.message);
        // Fallback: store external URL and let the app try to load it
        await prisma.post.create({
          data: {
            authorId: user.id,
            caption: vid.caption,
            type: 'SHORT_VIDEO',
            visibility: 'PUBLIC',
            status: 'PUBLISHED',
            aiLabel: 'NONE',
            media: {
              create: {
                userId: user.id,
                s3Key: `demo/${u.username}-reel.mp4`,
                bucket: 'demo',
                url: vid.url,  // ← Fallback to external URL
                mimeType: 'video/mp4',
                size: 0, width: 720, height: 1280, durationSec: 15,
                uploadStatus: 'PUBLISHED',
                moderationStatus: 'APPROVED',
                order: 0,
              },
            },
          },
        });
        posts++;
      }
    } else {
      // Repair: existing demo reels may point at dead URLs — refresh them.
      const updated = await prisma.mediaAsset.updateMany({
        where: { s3Key: `demo/${u.username}-reel.mp4` },
        data: { url: vid.url },
      });
      if (updated.count > 0) console.log(`Repaired reel URL for ${u.username}`);
    }
  }
  console.log(`Demo content ready: ${DEMO_USERS.length} users, ${posts} posts`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

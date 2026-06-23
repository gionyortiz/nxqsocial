/* eslint-disable no-console */
// Generates mobile icon assets from the emblem-only app icon source.
// Keep poster artwork separate from app icons to avoid text in launcher assets.

const fs = require('fs');
const path = require('path');
const sharp = require(path.resolve(__dirname, '..', '..', 'frontend', 'node_modules', 'sharp'));

const SRC_DIR = path.join(__dirname, '..', 'assets', 'images', 'source');
const OUT_DIR = path.join(__dirname, '..', 'assets', 'images');

const appIconSrc = path.join(SRC_DIR, 'nxq-social-app-icon.png');
const BG_COLOR = { r: 10, g: 15, b: 30 };

if (!fs.existsSync(appIconSrc)) {
  throw new Error(`Missing source icon: ${appIconSrc}`);
}

async function renderCenteredPng(size) {
  const buffer = await sharp(appIconSrc)
    .resize(size, size, { fit: 'contain' })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: buffer, gravity: 'center' }])
    .png()
    .toBuffer();
}

async function main() {
  // 1) iOS / Expo app icon — must be opaque and emblem-only.
  await sharp(appIconSrc)
    .resize(1024, 1024, { fit: 'cover' })
    .flatten({ background: BG_COLOR })
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT_DIR, 'icon.png'));
  console.log('✓ icon.png (1024x1024, emblem-only, opaque)');

  // 2) Splash icon — centered emblem on transparent canvas.
  const splashBuffer = await renderCenteredPng(760);
  await sharp(splashBuffer).toFile(path.join(OUT_DIR, 'splash-icon.png'));
  console.log('✓ splash-icon.png (centered)');

  // 3) Web favicon.
  await sharp(appIconSrc)
    .resize(48, 48, { fit: 'cover' })
    .png()
    .toFile(path.join(OUT_DIR, 'favicon.png'));
  console.log('✓ favicon.png');

  // 4) Android adaptive foreground — centered within safe area.
  const foregroundBuffer = await renderCenteredPng(660);
  await sharp(foregroundBuffer).toFile(path.join(OUT_DIR, 'android-icon-foreground.png'));
  console.log('✓ android-icon-foreground.png (safe area centered)');

  // 5) Android adaptive background.
  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 3,
      background: BG_COLOR,
    },
  })
    .png()
    .toFile(path.join(OUT_DIR, 'android-icon-background.png'));
  console.log('✓ android-icon-background.png');

  // 6) Android monochrome.
  await sharp(foregroundBuffer)
    .greyscale()
    .png()
    .toFile(path.join(OUT_DIR, 'android-icon-monochrome.png'));
  console.log('✓ android-icon-monochrome.png');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

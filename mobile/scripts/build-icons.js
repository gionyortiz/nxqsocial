/* eslint-disable no-console */
// Renders NXQ brand SVGs into all icon variants expo + iOS need.
// iOS app icon MUST be fully opaque (no alpha channel) — we flatten over the
// brand background colour to guarantee that.

const fs = require('fs');
const path = require('path');
const sharp = require(path.resolve(__dirname, '..', '..', 'frontend', 'node_modules', 'sharp'));

const SRC_DIR = path.join(__dirname, '..', 'assets', 'images', 'source');
const OUT_DIR = path.join(__dirname, '..', 'assets', 'images');

const iconSvg = fs.readFileSync(path.join(SRC_DIR, 'nxq-icon.svg'));
const fgSvg = fs.readFileSync(path.join(SRC_DIR, 'nxq-icon-foreground.svg'));

async function main() {
  // 1) iOS / Expo main icon — 1024×1024 opaque JPEG-style PNG (alpha removed)
  await sharp(iconSvg, { density: 768 })
    .resize(1024, 1024)
    .flatten({ background: { r: 30, g: 27, b: 75 } }) // brand indigo
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT_DIR, 'icon.png'));
  console.log('✓ icon.png (1024×1024, opaque)');

  // 2) Splash icon — keep transparent so expo-splash-screen lays it on the bg
  await sharp(fgSvg, { density: 768 })
    .resize(1024, 1024)
    .png()
    .toFile(path.join(OUT_DIR, 'splash-icon.png'));
  console.log('✓ splash-icon.png');

  // 3) Favicon (web)
  await sharp(iconSvg, { density: 256 })
    .resize(48, 48)
    .png()
    .toFile(path.join(OUT_DIR, 'favicon.png'));
  console.log('✓ favicon.png');

  // 4) Android adaptive icon foreground (foreground art, transparent bg)
  await sharp(fgSvg, { density: 768 })
    .resize(1024, 1024)
    .png()
    .toFile(path.join(OUT_DIR, 'android-icon-foreground.png'));
  console.log('✓ android-icon-foreground.png');

  // 5) Android adaptive background (solid brand colour)
  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 3,
      background: { r: 30, g: 27, b: 75 },
    },
  })
    .png()
    .toFile(path.join(OUT_DIR, 'android-icon-background.png'));
  console.log('✓ android-icon-background.png');

  // 6) Android monochrome (flat white silhouette of the foreground)
  await sharp(fgSvg, { density: 768 })
    .resize(1024, 1024)
    .greyscale()
    .png()
    .toFile(path.join(OUT_DIR, 'android-icon-monochrome.png'));
  console.log('✓ android-icon-monochrome.png');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

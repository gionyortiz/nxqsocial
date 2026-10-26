// EAS supplies a Mac for iOS builds. Exercise the actual Core Image pipeline
// there before archiving; Windows JS tests cannot render AVFoundation frames.
const { spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
if (process.platform !== 'darwin' || process.env.EAS_BUILD_PLATFORM === 'android') process.exit(0);
const folder = mkdtempSync(join(tmpdir(), 'nxq-effects-check-'));
try {
  const binary = join(folder, 'verify-video-effects');
  for (const [command, args] of [
    ['xcrun', ['swiftc', '-parse-as-library', '-swift-version', '5',
      resolve('modules/nxq-video-effects/ios/VideoEffectPipeline.swift'),
      resolve('modules/nxq-video-effects/tests/NativeSmoke.swift'), '-o', binary]],
    [binary, []],
  ]) {
    const result = spawnSync(command, args, { stdio: 'inherit', timeout: 180000 });
    if (result.error || result.status !== 0) throw new Error('Native video-effects verification failed');
  }
} finally {
  rmSync(folder, { recursive: true, force: true });
}

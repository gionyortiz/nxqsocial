import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(root, '..');

async function read(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), 'utf8');
}

const [
  appJsonText,
  easJsonText,
  packageJsonText,
  apiSource,
  authSource,
  secureStorageSource,
  liveRoomSource,
  webLiveSource,
  e2eSetupSource,
] = await Promise.all([
  read('mobile/app.json'),
  read('mobile/eas.json'),
  read('mobile/package.json'),
  read('mobile/lib/api.ts'),
  read('mobile/lib/auth.tsx'),
  read('mobile/lib/secure-auth-storage.ts'),
  read('mobile/app/live-room.tsx'),
  read('frontend/src/app/live/[room]/page.tsx'),
  read('backend/test/e2e/setup.ts'),
]);

const appJson = JSON.parse(appJsonText);
const easJson = JSON.parse(easJsonText);
const packageJson = JSON.parse(packageJsonText);

assert.equal(appJson.expo.version, '1.0.8', 'The password hotfix remains a candidate for App Store version 1.0.8');
assert.equal(appJson.expo.ios.bundleIdentifier, 'com.gionyortiz.nxqsocial');
assert.equal(appJson.expo.runtimeVersion?.policy, 'appVersion');
assert.equal(appJson.expo.ios.associatedDomains, undefined, 'Associated Domains must stay disabled for the current signing profile');
assert.equal(easJson.cli.appVersionSource, 'remote');
assert.equal(appJson.expo.ios.buildNumber, undefined, 'Only EAS may supply the production iOS build number');
assert.equal(easJson.build.production.autoIncrement, true);
assert.equal(easJson.build.production.env.EXPO_PUBLIC_LIVE_NATIVE_ENABLED, 'false');
assert.equal(easJson.build.production.env.EXPO_PUBLIC_API_BASE_URL, 'https://api.nxqsocial.com/api');
assert.equal(packageJson.dependencies['expo-secure-store'], '~57.0.3');

assert.match(apiSource, /retryNetworkErrors \?\? method === 'GET'/, 'Only GET requests may retry by default');
assert.doesNotMatch(apiSource, /retryNetworkErrors = true/, 'Global mutation retries must stay disabled');

assert.match(authSource, /from '\.\/secure-auth-storage'/);
assert.doesNotMatch(authSource, /const TOKEN_KEY/, 'AuthProvider must not manage credentials in AsyncStorage');
assert.match(secureStorageSource, /SecureStore\.setItemAsync/);
assert.match(secureStorageSource, /SecureStore\.getItemAsync/);
assert.match(secureStorageSource, /SecureStore\.deleteItemAsync/);
assert.match(secureStorageSource, /AsyncStorage\.removeItem\(TOKEN_KEY\)/, 'Legacy token must be erased after migration');

assert.match(liveRoomSource, /#\$\{fragment\.toString\(\)\}/, 'Live credentials must use a URL fragment');
assert.doesNotMatch(liveRoomSource, /const search = new URLSearchParams\(\{[\s\S]{0,160}token:/, 'Live credentials must not be sent as query parameters');
assert.match(webLiveSource, /window\.location\.hash/);
assert.match(webLiveSource, /window\.history\.replaceState/, 'Consumed live credentials must be removed from browser history');

assert.match(e2eSetupSource, /sk_test_e2e_placeholder_nxqsocial/);
assert.match(e2eSetupSource, /e2e-only-jwt-secret-nxqsocial/);
assert.match(e2eSetupSource, /e2e-only-otp-pepper-nxqsocial/);

console.log('Password hotfix release-safety invariants passed (25 assertions).');

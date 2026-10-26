import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const TOKEN_KEY = 'nxq.mobile.token';
export const USER_KEY = 'nxq.mobile.user';

const KEYCHAIN_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

async function nativeSecureStoreAvailable() {
  if (Platform.OS === 'web') return false;
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Reads the session credential from Keychain/Keystore. Existing Build 87
 * sessions are migrated once from AsyncStorage and the legacy copy is erased.
 * Native platforms fail closed if secure storage is unavailable.
 */
export async function readStoredAuthToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return AsyncStorage.getItem(TOKEN_KEY);
  }

  if (!(await nativeSecureStoreAvailable())) return null;

  const secureToken = await SecureStore.getItemAsync(TOKEN_KEY, KEYCHAIN_OPTIONS);
  if (secureToken) {
    // A prior migration may have stored the secure copy but failed to remove
    // the legacy copy. Retry that cleanup before restoring the session.
    await AsyncStorage.removeItem(TOKEN_KEY);
    return secureToken;
  }

  const legacyToken = await AsyncStorage.getItem(TOKEN_KEY);
  if (!legacyToken) return null;

  await SecureStore.setItemAsync(TOKEN_KEY, legacyToken, KEYCHAIN_OPTIONS);
  await AsyncStorage.removeItem(TOKEN_KEY);
  return legacyToken;
}

export async function storeAuthToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(TOKEN_KEY, token);
    return;
  }

  if (!(await nativeSecureStoreAvailable())) {
    throw new Error('Secure credential storage is unavailable on this device.');
  }

  await SecureStore.setItemAsync(TOKEN_KEY, token, KEYCHAIN_OPTIONS);
  await AsyncStorage.removeItem(TOKEN_KEY);
}

export async function clearStoredAuthSession(): Promise<void> {
  const tasks: Promise<unknown>[] = [
    AsyncStorage.removeItem(TOKEN_KEY),
    AsyncStorage.removeItem(USER_KEY),
  ];

  if (Platform.OS !== 'web') {
    tasks.push(SecureStore.deleteItemAsync(TOKEN_KEY, KEYCHAIN_OPTIONS));
  }

  await Promise.allSettled(tasks);
}

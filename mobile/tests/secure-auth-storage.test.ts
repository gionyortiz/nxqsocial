import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { clearStoredAuthSession, readStoredAuthToken, storeAuthToken } from '../lib/secure-auth-storage';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(),
}));
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'fixture-this-device-only',
  isAvailableAsync: jest.fn(), getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn(),
}));

beforeEach(() => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  (SecureStore.isAvailableAsync as jest.Mock).mockReset().mockResolvedValue(true);
  (SecureStore.getItemAsync as jest.Mock).mockReset().mockResolvedValue(null);
  (SecureStore.setItemAsync as jest.Mock).mockReset().mockResolvedValue(undefined);
  (SecureStore.deleteItemAsync as jest.Mock).mockReset().mockResolvedValue(undefined);
  (AsyncStorage.getItem as jest.Mock).mockReset().mockResolvedValue(null);
  (AsyncStorage.removeItem as jest.Mock).mockReset().mockResolvedValue(undefined);
});

test('native sessions are stored in this-device-only Keychain, not AsyncStorage', async () => {
  await storeAuthToken('fixture-session');
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith('nxq.mobile.token', 'fixture-session', { keychainAccessible: 'fixture-this-device-only' });
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  expect(AsyncStorage.removeItem).toHaveBeenCalledWith('nxq.mobile.token');
});

test('legacy session migrates only after the secure write succeeds', async () => {
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue('fixture-legacy');
  expect(await readStoredAuthToken()).toBe('fixture-legacy');
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith('nxq.mobile.token', 'fixture-legacy', expect.any(Object));
  expect((SecureStore.setItemAsync as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan((AsyncStorage.removeItem as jest.Mock).mock.invocationCallOrder[0]);
});

test('failed secure migration never returns the insecure token as a fallback', async () => {
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue('fixture-legacy');
  (SecureStore.setItemAsync as jest.Mock).mockRejectedValue(new Error('Fixture Keychain unavailable'));
  await expect(readStoredAuthToken()).rejects.toThrow('Keychain unavailable');
  expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
});

test('restoring a secure session removes leftover legacy credentials', async () => {
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('fixture-secure');
  expect(await readStoredAuthToken()).toBe('fixture-secure');
  expect(AsyncStorage.getItem).not.toHaveBeenCalled();
  expect(AsyncStorage.removeItem).toHaveBeenCalledWith('nxq.mobile.token');
});

test('unavailable native secure storage fails closed', async () => {
  (SecureStore.isAvailableAsync as jest.Mock).mockResolvedValue(false);
  expect(await readStoredAuthToken()).toBeNull();
  await expect(storeAuthToken('fixture-session')).rejects.toThrow('Secure credential storage is unavailable');
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});

test('logout attempts every credential deletion even when one backend fails', async () => {
  (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValue(new Error('Fixture deletion failure'));
  await clearStoredAuthSession();
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('nxq.mobile.token', expect.any(Object));
  expect(AsyncStorage.removeItem).toHaveBeenCalledWith('nxq.mobile.token');
  expect(AsyncStorage.removeItem).toHaveBeenCalledWith('nxq.mobile.user');
});

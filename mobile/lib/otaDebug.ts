import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'nxq.mobile.otaDebug';

export async function saveOtaDebugInfo(info: Record<string, unknown>): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(info, null, 2));
  } catch {
    // best effort — diagnostics must never crash the app
  }
}

export async function getOtaDebugInfo(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEY);
  } catch {
    return null;
  }
}

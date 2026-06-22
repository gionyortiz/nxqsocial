import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { apiRequest } from './api';

const notificationProjectId =
  Constants.expoConfig?.extra?.eas?.projectId
  || Constants.easConfig?.projectId
  || undefined;

let cachedToken: string | null = null;

export async function getExpoPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  if (!Device.isDevice) return null;

  const perms = await Notifications.getPermissionsAsync();
  let status = perms.status;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#8b5cf6',
      sound: 'default',
    });
  }

  const token = await Notifications.getExpoPushTokenAsync(
    notificationProjectId ? { projectId: notificationProjectId } : undefined,
  );
  return token.data ?? null;
}

export async function ensurePushRegistration(authToken: string) {
  const token = await getExpoPushToken();
  if (!token) return null;
  if (cachedToken === token) return token;

  await apiRequest('/notifications/push/register', {
    method: 'POST',
    token: authToken,
    body: { token },
  });
  cachedToken = token;
  return token;
}

export async function unregisterPushToken(authToken?: string | null) {
  if (!cachedToken || !authToken) {
    cachedToken = null;
    return;
  }
  try {
    await apiRequest('/notifications/push/unregister', {
      method: 'POST',
      token: authToken,
      body: { token: cachedToken },
    });
  } finally {
    cachedToken = null;
  }
}

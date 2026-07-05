import 'react-native-reanimated';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Updates from 'expo-updates';

import { useColorScheme } from '@/components/useColorScheme';
import { apiRequest } from '@/lib/api';
import { AuthProvider, useAuth } from '@/lib/auth';
import { pauseAllMedia } from '@/lib/mediaPlayback';
import { ensurePushRegistration } from '@/lib/push';
import { mobileProof } from '@/lib/runtimeProof';

// Register LiveKit WebRTC globals once for native in-app Live.
// Guarded so web/Expo Go (no native module) does not crash on startup.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { registerGlobals } = require('@livekit/react-native');
  registerGlobals?.();
} catch {
  // Native module unavailable (web / Expo Go) — Live runs on native builds only.
}

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: 'index',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
void SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore if splash is already prevented in this process.
});

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function normalizeCallVideoFlag(value: unknown) {
  return value === true || value === 'true' || value === '1';
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <AuthProvider>
      <RootLayoutInner colorScheme={colorScheme} />
    </AuthProvider>
  );
}

function RootLayoutInner({ colorScheme }: { colorScheme: string | null | undefined }) {
  const { token } = useAuth();
  const router = useRouter();
  const lastInviteKey = useRef<string | null>(null);

  const openIncomingCallPrompt = (payload: { room?: string; from?: string; video?: boolean }) => {
    const room = payload.room || '';
    if (!room) return;
    mobileProof('Incoming call payload', payload);
    const key = `${room}:${payload.from || ''}`;
    if (lastInviteKey.current === key) return;
    lastInviteKey.current = key;

    Alert.alert(
      payload.video ? 'Incoming video call' : 'Incoming call',
      `${payload.from || 'Someone'} is calling you`,
      [
        {
          text: 'Decline',
          style: 'destructive',
          onPress: () => {
            if (!token) return;
            apiRequest('/calls/decline', { method: 'POST', token }).catch(() => {
              // keep UX stable if decline fails
            });
          },
        },
        {
          text: 'Join',
          onPress: () => {
            if (!token) return;
            apiRequest('/calls/decline', { method: 'POST', token }).catch(() => {
              // best effort clear
            });
            const mode = payload.video ? 'video' : 'call';
            mobileProof('Incoming call navigation', { room, mode, role: 'participant', kind: 'call' });
            pauseAllMedia();
            router.push({ pathname: '/live-native' as never, params: { room, role: 'participant', mode, kind: 'call' } as never });
          },
        },
      ],
      { cancelable: true },
    );
  };

  useEffect(() => {
    // Explicit OTA check — don't rely solely on native auto-check-on-load,
    // which gives no visibility if it silently fails to fire.
    if (!Updates.isEnabled) return; // no-op in Expo Go / dev client
    (async () => {
      try {
        const result = await Updates.checkForUpdateAsync();
        mobileProof('OTA update check', result);
        if (result.isAvailable) {
          await Updates.fetchUpdateAsync();
          mobileProof('OTA update fetched — reloading');
          await Updates.reloadAsync();
        }
      } catch (e: any) {
        mobileProof('OTA update check failed', { message: e?.message });
      }
    })();
  }, []);

  useEffect(() => {
    if (!token) return;
    ensurePushRegistration(token).catch(() => {
      // keep auth flow resilient even if push registration fails
    });
  }, [token]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, any>;
      if (data?.type === 'call_invite' && typeof data.room === 'string') {
        mobileProof('Push call notification payload', data);
        openIncomingCallPrompt({
          room: data.room,
          from: typeof data.from === 'string' ? data.from : undefined,
          video: normalizeCallVideoFlag(data.video),
        });
        return;
      }
      router.push('/(tabs)/more');
    });
    return () => sub.remove();
  }, [router, token]);

  useEffect(() => {
    if (!token) return;
    const checkIncoming = async () => {
      try {
        const invite = await apiRequest<{ room?: string; caller?: { username?: string }; video?: boolean } | null>('/calls/incoming', { token });
        if (invite?.room) {
          mobileProof('Incoming call poll response', invite);
          openIncomingCallPrompt({
            room: invite.room,
            from: invite.caller?.username,
            video: normalizeCallVideoFlag(invite.video),
          });
        }
      } catch {
        // polling failures should remain silent
      }
    };

    void checkIncoming();
    const timer = setInterval(() => {
      void checkIncoming();
    }, 9000);

    return () => clearInterval(timer);
  }, [token]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="messages/[threadId]" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
        <Stack.Screen name="explore" options={{ title: 'Explore' }} />
        <Stack.Screen name="user/[username]" options={{ title: 'Profile' }} />
        <Stack.Screen name="edit-profile" options={{ headerShown: false }} />
        <Stack.Screen name="live" options={{ title: 'Live' }} />
        <Stack.Screen name="live-room" options={{ title: 'Live Room' }} />
        <Stack.Screen name="live-native" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
        <Stack.Screen name="story-viewer" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      </Stack>
    </ThemeProvider>
  );
}

import { colors } from '@/lib/theme';
import 'react-native-reanimated';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { Keyboard } from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import { IncomingCall } from '@/components/IncomingCall';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ensurePushRegistration } from '@/lib/push';

// Register LiveKit WebRTC globals once for native in-app Live.
// Guarded so web/Expo Go (no native module) does not crash on startup.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { registerGlobals } = require('@livekit/react-native');
  registerGlobals?.();
} catch (error) {
  // Native module unavailable (web / Expo Go) — Live runs on native builds only.
  if (process.env.EXPO_PUBLIC_LIVE_NATIVE_ENABLED === 'true') {
    console.error('LiveKit native initialization failed.', error);
  }
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

const PUBLIC_AUTH_PATHS = new Set([
  '/',
  '/login',
  '/register',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
]);

function RootLayoutInner({ colorScheme }: { colorScheme: string | null | undefined }) {
  const { token, pendingVerification, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => { Keyboard.dismiss(); }, [pathname]);

  useEffect(() => {
    if (loading || token || PUBLIC_AUTH_PATHS.has(pathname)) return;
    router.replace(pendingVerification ? '/verify-email' : '/login');
  }, [loading, pathname, pendingVerification, router, token]);

  useEffect(() => {
    if (!token) return;
    ensurePushRegistration(token).catch(() => {
      // keep auth flow resilient even if push registration fails
    });
  }, [token]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      if (response.notification.request.content.data?.type !== 'call_invite') router.push('/(tabs)/more');
    });
    return () => sub.remove();
  }, [router]);

  return (
    <ThemeProvider value={{...DarkTheme, colors: {...DarkTheme.colors, background: colors.background, card: colors.surface, border: colors.border, text: colors.text, primary: colors.accent}}}>
      <IncomingCall token={token} />
      <Stack screenOptions={{headerStyle:{backgroundColor:colors.background},headerTintColor:colors.text,headerShadowVisible:false,contentStyle:{backgroundColor:colors.background}}}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
        <Stack.Screen name="reset-password" options={{ headerShown: false }} />
        <Stack.Screen name="change-password" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ headerShown: false }} />
        <Stack.Screen name="verify-email" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="messages/[threadId]" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
        <Stack.Screen name="app-updates" options={{ title: 'App updates' }} />
        <Stack.Screen name="explore" options={{ title: 'Explore' }} />
        <Stack.Screen name="user/[username]" options={{ title: 'Profile' }} />
        <Stack.Screen name="edit-profile" options={{ headerShown: false }} />
        <Stack.Screen name="live" options={{ title: 'Live' }} />
        <Stack.Screen name="live-room" options={{ title: 'Live Room' }} />
        <Stack.Screen name="new-call" options={{ headerShown: false }} />
        <Stack.Screen name="call" options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }} />
        <Stack.Screen name="live-native" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
        <Stack.Screen name="story-viewer" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      </Stack>
    </ThemeProvider>
  );
}

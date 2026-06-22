import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, SafeAreaView, Text, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { apiRequest } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { API_BASE_URL } from '@/lib/config';

const WEB_BASE_URL = (process.env.EXPO_PUBLIC_WEB_BASE_URL
  ?? API_BASE_URL.replace('://api.', '://').replace('/api', '')).replace(/\/$/, '');

type LiveTokenResponse = {
  token: string;
  url: string;
  room: string;
  identity: string;
};

export default function LiveRoomScreen() {
  const { token: authToken } = useAuth();
  const params = useLocalSearchParams<{ room?: string; host?: string }>();
  const room = typeof params.room === 'string' ? params.room : '';
  const isHost = params.host === '1';
  const [liveToken, setLiveToken] = useState<LiveTokenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);

  const roomUrl = useMemo(() => {
    if (!room || !liveToken) return '';
    const search = new URLSearchParams({
      mobile: '1',
      room,
      token: liveToken.token,
      serverUrl: liveToken.url,
      ...(isHost ? { host: '1' } : {}),
    });
    return `${WEB_BASE_URL}/live/${encodeURIComponent(room)}?${search.toString()}`;
  }, [room, liveToken, isHost]);

  useEffect(() => {
    const loadToken = async () => {
      if (!authToken || !room) return;
      setLoading(true);
      setError(null);
      try {
        const data = await apiRequest<LiveTokenResponse>('/calls/token', {
          method: 'POST',
          token: authToken,
          body: { room, video: isHost, host: true },
        });
        if (!data?.token || !data?.url) {
          throw new Error('Live video is not configured yet.');
        }
        setLiveToken(data);
      } catch (e: any) {
        setError(e?.message ?? 'Could not open live video.');
      } finally {
        setLoading(false);
      }
    };
    void loadToken();
  }, [authToken, room, isHost]);

  const openRoom = async () => {
    if (!roomUrl || opening) return;
    setOpening(true);
    try {
      const result = await WebBrowser.openBrowserAsync(roomUrl, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      });
      if (result.type !== 'opened') {
        await Linking.openURL(roomUrl);
      }
    } catch {
      try {
        await Linking.openURL(roomUrl);
      } catch {
        Alert.alert('Open live failed', 'Could not open the live video page. Try again.');
      }
    } finally {
      setOpening(false);
    }
  };

  useEffect(() => {
    if (!roomUrl) return;
    void openRoom();
  }, [roomUrl]);

  if (!room) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0b1020', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900', textAlign: 'center' }}>Missing live room</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16, borderRadius: 12, backgroundColor: '#4f46e5', paddingHorizontal: 16, paddingVertical: 12 }}>
          <Text style={{ color: '#fff', fontWeight: '800' }}>Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#8b5cf6" />
        <Text style={{ color: '#93a1bd', marginTop: 12 }}>{isHost ? 'Starting live video...' : 'Opening live video...'}</Text>
      </SafeAreaView>
    );
  }

  if (error || !roomUrl) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0b1020', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900', textAlign: 'center' }}>Live unavailable</Text>
        <Text style={{ color: '#fca5a5', marginTop: 10, textAlign: 'center' }}>{error || 'Could not open this live room.'}</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 18, borderRadius: 12, backgroundColor: '#4f46e5', paddingHorizontal: 16, paddingVertical: 12 }}>
          <Text style={{ color: '#fff', fontWeight: '800' }}>Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b1020', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900', textAlign: 'center' }}>{isHost ? 'Your live room is ready' : 'Live room is ready'}</Text>
      <Text style={{ color: '#93a1bd', marginTop: 10, textAlign: 'center' }}>
        The video opens in Safari with your mobile live token, so it will not ask for web login.
      </Text>
      <Pressable
        onPress={openRoom}
        disabled={opening}
        style={{ marginTop: 22, borderRadius: 14, backgroundColor: opening ? '#374151' : '#4f46e5', paddingHorizontal: 18, paddingVertical: 13, minWidth: 190 }}
      >
        <Text style={{ color: '#fff', fontWeight: '900', textAlign: 'center' }}>{opening ? 'Opening...' : 'Open live video'}</Text>
      </Pressable>
      <Pressable onPress={() => router.back()} style={{ marginTop: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
        <Text style={{ color: '#a5b4fc', fontWeight: '800' }}>Back to Live</Text>
      </Pressable>
    </SafeAreaView>
  );
}

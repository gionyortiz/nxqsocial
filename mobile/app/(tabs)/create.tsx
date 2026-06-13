import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { API_BASE_URL } from '@/lib/config';
import { useAuth } from '@/lib/auth';

function VideoPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  return (
    <VideoView
      player={player}
      style={{ width: '100%', height: 260, borderRadius: 12, backgroundColor: '#000' }}
      contentFit="contain"
      nativeControls
    />
  );
}

export default function CreateScreen() {
  const { token } = useAuth();
  const [assetUri, setAssetUri] = useState<string | null>(null);
  const [assetType, setAssetType] = useState<'image' | 'video' | null>(null);
  const [caption, setCaption] = useState('');
  const [posting, setPosting] = useState(false);

  const pickMedia = async () => {
    const perms = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perms.granted) {
      Alert.alert('Permission needed', 'Enable photo library access to create posts.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 1,
    });

    if (result.canceled || !result.assets?.length) return;
    const a = result.assets[0];
    setAssetUri(a.uri);
    setAssetType(a.type === 'video' ? 'video' : 'image');
  };

  const captureMedia = async () => {
    const perms = await ImagePicker.requestCameraPermissionsAsync();
    if (!perms.granted) {
      Alert.alert('Permission needed', 'Enable camera access to capture media.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images', 'videos'],
      quality: 1,
    });

    if (result.canceled || !result.assets?.length) return;
    const a = result.assets[0];
    setAssetUri(a.uri);
    setAssetType(a.type === 'video' ? 'video' : 'image');
  };

  const submit = async () => {
    if (!token || !assetUri || !assetType) return;
    Keyboard.dismiss();
    setPosting(true);
    try {
      const filename = assetType === 'video' ? 'mobile-upload.mp4' : 'mobile-upload.jpg';
      const mime = assetType === 'video' ? 'video/mp4' : 'image/jpeg';
      const form = new FormData();
      form.append('caption', caption);
      form.append('type', assetType === 'video' ? 'VIDEO' : 'PHOTO');
      form.append('visibility', 'PUBLIC');
      form.append('media', {
        uri: assetUri,
        name: filename,
        type: mime,
      } as any);

      const res = await fetch(`${API_BASE_URL}/posts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        body: form,
      });
      const status = res.status;
      const responseBody = await res.text();

      if (status < 200 || status >= 300) {
        const err = (() => {
          try {
            return JSON.parse(responseBody || '{}');
          } catch {
            return {} as any;
          }
        })();
        throw new Error(err?.message || `Failed to create post (${status})`);
      }

      setAssetUri(null);
      setAssetType(null);
      setCaption('');
      Alert.alert('Posted', 'Your content is now live on NXQ Social.');
    } catch (e: any) {
      const rawMessage = String(e?.message || 'Could not publish post.');
      const lowered = rawMessage.toLowerCase();
      const userMessage = lowered.includes('unsupported formdatapart')
        ? 'Upload failed due to iOS multipart compatibility. Please try again in the latest build.'
        : rawMessage;
      Alert.alert('Upload failed', userMessage);
    } finally {
      setPosting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b1020' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 14 : 0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 28 }}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900' }}>Create Post</Text>
            <Text style={{ color: '#93a1bd' }}>Use camera or library for photo/video uploads.</Text>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={captureMedia} style={{ flex: 1, backgroundColor: '#111827', borderRadius: 12, padding: 14 }}>
                <Text style={{ color: '#c7d2fe', fontWeight: '700', textAlign: 'center' }}>Open camera</Text>
              </Pressable>
              <Pressable onPress={pickMedia} style={{ flex: 1, backgroundColor: '#111827', borderRadius: 12, padding: 14 }}>
                <Text style={{ color: '#c7d2fe', fontWeight: '700', textAlign: 'center' }}>{assetUri ? 'Change media' : 'Pick from library'}</Text>
              </Pressable>
            </View>

            {assetUri && assetType === 'image' ? (
              <Image source={{ uri: assetUri }} style={{ width: '100%', height: 260, borderRadius: 12 }} resizeMode="cover" />
            ) : null}

            {assetUri && assetType === 'video' ? (
              <VideoPreview uri={assetUri} />
            ) : null}

            <TextInput
              value={caption}
              onChangeText={setCaption}
              placeholder="Write a caption"
              placeholderTextColor="#8790ab"
              multiline
              style={{ backgroundColor: '#151d33', color: '#fff', borderRadius: 12, padding: 12, minHeight: 90, textAlignVertical: 'top' }}
            />

            <Pressable
              onPress={submit}
              disabled={!assetUri || posting}
              style={{ backgroundColor: '#4f46e5', borderRadius: 12, paddingVertical: 14, alignItems: 'center', opacity: !assetUri || posting ? 0.6 : 1 }}
            >
              {posting ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>Publish</Text>}
            </Pressable>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

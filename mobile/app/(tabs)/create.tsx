import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { API_BASE_URL } from '@/lib/config';
import { useAuth } from '@/lib/auth';

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
    setPosting(true);
    try {
      const form = new FormData();
      form.append('caption', caption);
      form.append('type', assetType === 'video' ? 'VIDEO' : 'PHOTO');
      form.append('visibility', 'PUBLIC');

      const filename = assetType === 'video' ? 'mobile-upload.mp4' : 'mobile-upload.jpg';
      const mime = assetType === 'video' ? 'video/mp4' : 'image/jpeg';
      form.append('media', {
        uri: assetUri,
        name: filename,
        type: mime,
      } as any);

      const res = await fetch(`${API_BASE_URL}/posts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.message || 'Failed to create post');
      }

      setAssetUri(null);
      setAssetType(null);
      setCaption('');
      Alert.alert('Posted', 'Your content is now live on NXQ Social.');
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message || 'Could not publish post.');
    } finally {
      setPosting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b1020' }}>
      <View style={{ flex: 1, padding: 14, gap: 12 }}>
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
          <Video source={{ uri: assetUri }} style={{ width: '100%', height: 260, borderRadius: 12, backgroundColor: '#000' }} resizeMode={ResizeMode.CONTAIN} useNativeControls shouldPlay={false} />
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
      </View>
    </SafeAreaView>
  );
}

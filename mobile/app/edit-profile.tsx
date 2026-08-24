import { useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { File, UploadType } from 'expo-file-system';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { apiRequest, resolveMediaUrl } from '@/lib/api';
import { API_BASE_URL } from '@/lib/config';

export default function EditProfileScreen() {
  const router = useRouter();
  const { token, user, updateUser } = useAuth();

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [location, setLocation] = useState(user?.location ?? '');
  const [website, setWebsite] = useState(user?.website ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);

  const initials = (user?.displayName || user?.username || 'NX').slice(0, 2).toUpperCase();

  const pickAvatar = async () => {
    if (!token) return;
    const perms = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perms.granted) {
      Alert.alert('Permission needed', 'Enable photo library access to change your profile photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    setUploadingAvatar(true);
    try {
      // Use Expo's native multipart uploader on devices. Passing a web Blob
      // through React Native FormData causes "Unsupported FormDataPart".
      let status: number;
      let body: string;

      if (Platform.OS === 'web') {
        const form = new FormData();
        const blob = await (await fetch(asset.uri)).blob();
        form.append('avatar', blob, asset.fileName || 'avatar.jpg');

        const res = await fetch(`${API_BASE_URL}/users/me/avatar`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          body: form,
        });
        status = res.status;
        body = await res.text();
      } else {
        const normalized = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{ resize: { width: 1024 } }],
          { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
        );
        const avatarFile = new File(normalized.uri);
        const upload = await avatarFile.upload(`${API_BASE_URL}/users/me/avatar/raw`, {
          httpMethod: 'PATCH',
          uploadType: UploadType.BINARY_CONTENT,
          mimeType: 'image/jpeg',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            'Content-Type': 'image/jpeg',
          },
          sessionType: 'foreground',
        });
        status = upload.status;
        body = upload.body;
      }

      if (status < 200 || status >= 300) {
        const err = (() => { try { return JSON.parse(body || '{}'); } catch { return {} as any; } })();
        throw new Error(err?.message || 'Could not update profile photo');
      }
      const parsed = JSON.parse(body || '{}');
      setAvatarUrl(parsed.avatarUrl);
      await updateUser({ avatarUrl: parsed.avatarUrl });
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Could not update profile photo.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const save = async () => {
    if (!token) return;
    setSaving(true);
    try {
      const updated = await apiRequest<any>('/users/me/profile', {
        method: 'PUT',
        token,
        body: { displayName, bio, location, website },
      });
      await updateUser({
        displayName: updated.displayName,
        bio: updated.bio,
        location: updated.location,
        website: updated.website,
      });
      router.back();
    } catch (e: any) {
      Alert.alert('Could not save', e?.message ?? 'Please check your info and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b1020' }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable onPress={() => router.back()}>
              <MaterialCommunityIcons name="chevron-left" size={28} color="#fff" />
            </Pressable>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900' }}>Edit profile</Text>
            <View style={{ width: 28 }} />
          </View>

          <View style={{ alignItems: 'center', gap: 10 }}>
            <Pressable onPress={pickAvatar} style={{ position: 'relative' }}>
              <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: '#312e81', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {avatarUrl ? (
                  <Image source={{ uri: resolveMediaUrl(avatarUrl) }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                ) : (
                  <Text style={{ color: '#ddd6fe', fontSize: 28, fontWeight: '900' }}>{initials}</Text>
                )}
                {uploadingAvatar ? (
                  <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator color="#fff" />
                  </View>
                ) : null}
              </View>
              <View style={{ position: 'absolute', bottom: -2, right: -2, width: 30, height: 30, borderRadius: 15, backgroundColor: '#4f46e5', borderWidth: 2, borderColor: '#0b1020', alignItems: 'center', justifyContent: 'center' }}>
                <MaterialCommunityIcons name="camera" size={16} color="#fff" />
              </View>
            </Pressable>
            <Text style={{ color: '#93a1bd', fontSize: 12 }}>Tap to change profile photo</Text>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ color: '#93a1bd', fontSize: 12, fontWeight: '700' }}>Display name</Text>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              maxLength={50}
              placeholder="Your name"
              placeholderTextColor="#5b6680"
              style={{ backgroundColor: '#111827', borderRadius: 12, padding: 12, color: '#fff', borderWidth: 1, borderColor: '#1f2937' }}
            />
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ color: '#93a1bd', fontSize: 12, fontWeight: '700' }}>Bio</Text>
            <TextInput
              value={bio}
              onChangeText={setBio}
              maxLength={160}
              multiline
              placeholder="Tell people about yourself"
              placeholderTextColor="#5b6680"
              style={{ backgroundColor: '#111827', borderRadius: 12, padding: 12, color: '#fff', borderWidth: 1, borderColor: '#1f2937', minHeight: 80, textAlignVertical: 'top' }}
            />
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ color: '#93a1bd', fontSize: 12, fontWeight: '700' }}>Location</Text>
            <TextInput
              value={location}
              onChangeText={setLocation}
              maxLength={100}
              placeholder="City, Country"
              placeholderTextColor="#5b6680"
              style={{ backgroundColor: '#111827', borderRadius: 12, padding: 12, color: '#fff', borderWidth: 1, borderColor: '#1f2937' }}
            />
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ color: '#93a1bd', fontSize: 12, fontWeight: '700' }}>Website</Text>
            <TextInput
              value={website}
              onChangeText={setWebsite}
              maxLength={200}
              autoCapitalize="none"
              keyboardType="url"
              placeholder="yoursite.com"
              placeholderTextColor="#5b6680"
              style={{ backgroundColor: '#111827', borderRadius: 12, padding: 12, color: '#fff', borderWidth: 1, borderColor: '#1f2937' }}
            />
          </View>

          <Pressable
            onPress={save}
            disabled={saving}
            style={{ backgroundColor: '#4f46e5', borderRadius: 14, paddingVertical: 14, alignItems: 'center', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '900' }}>Save changes</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

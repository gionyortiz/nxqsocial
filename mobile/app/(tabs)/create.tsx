import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { File, UploadType } from 'expo-file-system';
import { useEffect, useRef, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Alert,
  LayoutChangeEvent,
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { API_BASE_URL, LIVE_NATIVE_ENABLED } from '@/lib/config';
import { useAuth } from '@/lib/auth';
import { CreateActionSheet, CreateActionMode } from '@/components/CreateActionSheet';

type UploadErrorView = {
  title: string;
  message: string;
  retryable: boolean;
};

type Audience = 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE';

const AUDIENCES: { value: Audience; label: string; desc: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { value: 'PUBLIC', label: 'Public', desc: 'Anyone on NXQ', icon: 'earth' },
  { value: 'FOLLOWERS', label: 'Followers', desc: 'Only your followers', icon: 'account-group' },
  { value: 'PRIVATE', label: 'Only me', desc: 'Visible to you only', icon: 'lock' },
];

const MEDIA_POLL_INTERVAL_MS = 1500;
const MEDIA_POLL_MAX_ATTEMPTS = 240; // ~6 minutes: transcode plus bounded moderation timeout

/**
 * Poll GET /media/:id/status while the video is still being processed
 * server-side (TRANSCODING, then SCANNING). Resolves once it's safe to
 * attach the asset to a post; throws if it's rejected or never finishes.
 */
async function pollMediaUntilProcessed(
  apiBase: string,
  token: string,
  mediaId: string,
  onStatus: (message: string) => void,
): Promise<void> {
  for (let attempt = 0; attempt < MEDIA_POLL_MAX_ATTEMPTS; attempt++) {
    const res = await fetch(`${apiBase}/media/${mediaId}/status`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const body = await res.json().catch(() => null);
    const status = body?.uploadStatus;

    if (status === 'REJECTED') {
      throw new Error(body?.message || 'Video could not be processed.');
    }
    if (status === 'PUBLISHED') {
      return;
    }

    onStatus(body?.message || 'Processing video...');
    await new Promise((resolve) => setTimeout(resolve, MEDIA_POLL_INTERVAL_MS));
  }

  throw new Error('Media is still processing. Please check its status and try again shortly.');
}

function mapUploadError(rawMessage: string, isVideo: boolean): UploadErrorView {
  const msg = rawMessage.toLowerCase();

  if (
    msg.includes('network request failed')
    || msg.includes('could not connect')
    || msg.includes('fetch failed')
    || msg.includes('load failed')
    || msg.includes('network error')
  ) {
    return {
      title: 'Network Error',
      message: 'Connection was interrupted. Check your network and try again.',
      retryable: true,
    };
  }

  if (
    msg.includes('413')
    || msg.includes('payload too large')
    || msg.includes('request entity too large')
    || msg.includes('entity too large')
    || msg.includes('too large')
  ) {
    return {
      title: 'File Too Large',
      message: 'This file is too large to upload. Try a shorter or smaller-quality media file.',
      retryable: false,
    };
  }

  if (
    msg.includes('timed out')
    || msg.includes('timeout')
    || msg.includes('etimedout')
    || msg.includes('storage upload failed (408)')
  ) {
    return {
      title: 'Upload Timed Out',
      message: 'The upload took too long. Please retry on a stronger connection.',
      retryable: true,
    };
  }

  if (
    msg.includes('invalidaccesskeyid')
    || msg.includes('signaturedoesnotmatch')
    || msg.includes('storage upload failed (403)')
  ) {
    return {
      title: 'Storage Temporarily Unavailable',
      message: 'Cloud media upload is unavailable right now. Please retry shortly.',
      retryable: true,
    };
  }

  if (
    msg.includes('unsupported formdatapart')
    || msg.includes('unsupported format')
    || msg.includes('invalid format')
    || msg.includes('mime')
    || msg.includes('video could not be processed')
  ) {
    return {
      title: 'Unsupported Format',
      message: isVideo
        ? 'Please upload MP4 (H.264/AAC) video.'
        : 'Please upload JPG, PNG, or WebP image.',
      retryable: false,
    };
  }

  if (
    msg.includes('scanning')
    || msg.includes('still processing')
    || msg.includes('pending')
    || msg.includes('moderation')
  ) {
    return {
      title: 'Video Still Processing',
      message: 'Your video is still being processed. Wait a moment and try publishing again.',
      retryable: true,
    };
  }

  return {
    title: 'Upload Failed',
    message: 'Something went wrong while publishing. Please retry.',
    retryable: true,
  };
}

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
  const { token, user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const initialModeHandled = useRef(false);
  const launchMode = typeof params.mode === 'string' ? params.mode : null;
  const launchModeLabel = launchMode === 'photo' ? 'Photo' : launchMode === 'reel' ? 'Reel' : launchMode === 'story' ? 'Story' : launchMode === 'live' ? 'Live' : null;
  const isStory = launchMode === 'story';
  const [assetUri, setAssetUri] = useState<string | null>(null);
  const [assetType, setAssetType] = useState<'image' | 'video' | null>(null);
  const [assetName, setAssetName] = useState<string | null>(null);
  const [assetMime, setAssetMime] = useState<string | null>(null);
  const [assetSize, setAssetSize] = useState<number | null>(null);
  const [assetWidth, setAssetWidth] = useState<number | null>(null);
  const [assetHeight, setAssetHeight] = useState<number | null>(null);
  const [previewWidth, setPreviewWidth] = useState(0);
  const [imageScale, setImageScale] = useState(1);
  const [imageOffsetX, setImageOffsetX] = useState(0);
  const [imageOffsetY, setImageOffsetY] = useState(0);
  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<Audience>('PUBLIC');
  const [posting, setPosting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusMessage, setUploadStatusMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<UploadErrorView | null>(null);
  const [publishedType, setPublishedType] = useState<'image' | 'video' | null>(null);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const previewHeight = 260;

  const resetComposer = () => {
    setAssetUri(null);
    setAssetType(null);
    setAssetName(null);
    setAssetMime(null);
    setAssetSize(null);
    setAssetWidth(null);
    setAssetHeight(null);
    setImageScale(1);
    setImageOffsetX(0);
    setImageOffsetY(0);
    setCaption('');
    setVisibility('PUBLIC');
    setUploadProgress(0);
    setUploadStatusMessage(null);
    setUploadError(null);
  };

  const storeSelectedAsset = (asset: ImagePicker.ImagePickerAsset) => {
    const isVideo = asset.type === 'video';
    const fallbackName = isVideo ? 'mobile-upload.mp4' : 'mobile-upload.jpg';
    const fallbackMime = isVideo ? 'video/mp4' : 'image/jpeg';
    const supportedMime = isVideo
      ? (asset.mimeType === 'video/mp4' ? asset.mimeType : fallbackMime)
      : (asset.mimeType && /^(image\/(jpeg|png))$/.test(asset.mimeType) ? asset.mimeType : fallbackMime);

    setAssetUri(asset.uri);
    setAssetType(isVideo ? 'video' : 'image');
    setAssetName(asset.fileName || fallbackName);
    setAssetMime(supportedMime);
    setAssetSize(asset.fileSize ?? null);
    setAssetWidth(asset.width ?? null);
    setAssetHeight(asset.height ?? null);
    setImageScale(1);
    setImageOffsetX(0);
    setImageOffsetY(0);
    setUploadError(null);
    setPublishedType(null);
  };

  const onPreviewLayout = (event: LayoutChangeEvent) => {
    const width = Math.round(event.nativeEvent.layout.width);
    if (width > 0 && width !== previewWidth) setPreviewWidth(width);
  };

  const getImageFrameMetrics = () => {
    if (!assetWidth || !assetHeight || !previewWidth) return null;
    const baseScale = Math.max(previewWidth / assetWidth, previewHeight / assetHeight);
    const totalScale = baseScale * imageScale;
    const shownWidth = assetWidth * totalScale;
    const shownHeight = assetHeight * totalScale;
    const maxOffsetX = Math.max(0, (shownWidth - previewWidth) / 2);
    const maxOffsetY = Math.max(0, (shownHeight - previewHeight) / 2);
    return { baseScale, totalScale, shownWidth, shownHeight, maxOffsetX, maxOffsetY };
  };

  const clampOffsets = (nextX: number, nextY: number) => {
    const metrics = getImageFrameMetrics();
    if (!metrics) return { x: nextX, y: nextY };
    return {
      x: Math.min(metrics.maxOffsetX, Math.max(-metrics.maxOffsetX, nextX)),
      y: Math.min(metrics.maxOffsetY, Math.max(-metrics.maxOffsetY, nextY)),
    };
  };

  const adjustOffset = (dx: number, dy: number) => {
    const next = clampOffsets(imageOffsetX + dx, imageOffsetY + dy);
    setImageOffsetX(next.x);
    setImageOffsetY(next.y);
  };

  const updateScale = (nextScale: number) => {
    const clampedScale = Math.min(3, Math.max(1, nextScale));
    setImageScale(clampedScale);
    // Keep image inside the frame after scale changes.
    setTimeout(() => {
      const next = clampOffsets(imageOffsetX, imageOffsetY);
      setImageOffsetX(next.x);
      setImageOffsetY(next.y);
    }, 0);
  };

  const pickMedia = async (mode: 'all' | 'video' | 'image' = 'all') => {
    const perms = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perms.granted) {
      Alert.alert('Permission needed', 'Enable photo library access to create posts.');
      return;
    }

    const mediaTypes: ('images' | 'videos')[] = mode === 'video'
      ? ['videos']
      : mode === 'image'
        ? ['images']
        : ['images', 'videos'];

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes,
      allowsEditing: true,
      quality: 1,
    });

    if (result.canceled || !result.assets?.length) return;
    storeSelectedAsset(result.assets[0]);
  };

  const captureMedia = async (mode: 'all' | 'video' | 'image' = 'all') => {
    const perms = await ImagePicker.requestCameraPermissionsAsync();
    if (!perms.granted) {
      Alert.alert('Permission needed', 'Enable camera access to capture media.');
      return;
    }

    const mediaTypes: ('images' | 'videos')[] = mode === 'video'
      ? ['videos']
      : mode === 'image'
        ? ['images']
        : ['images', 'videos'];

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes,
      allowsEditing: true,
      quality: 1,
    });

    if (result.canceled || !result.assets?.length) return;
    const captured = result.assets[0];

    if (captured.type === 'video') {
      // Some Android devices report a successful capture (canceled: false)
      // even when the user pressed system "back" instead of an explicit
      // confirm button after stopping the recording. Add our own explicit
      // confirm step so "back" reliably discards the clip.
      const useIt = await new Promise<boolean>((resolve) => {
        Alert.alert(
          'Use this video?',
          'Keep the video you just recorded, or discard it.',
          [
            { text: 'Discard', style: 'destructive', onPress: () => resolve(false) },
            { text: 'Use video', onPress: () => resolve(true) },
          ],
          { cancelable: false },
        );
      });
      if (!useIt) return;
    }

    storeSelectedAsset(captured);
  };

  const chooseReelSource = () => {
    Alert.alert(
      'Create a reel',
      'Choose an existing video or record a new one.',
      [
        { text: 'Choose from Library', onPress: () => void pickMedia('video') },
        { text: 'Record Video', onPress: () => void captureMedia('video') },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  useEffect(() => {
    if (initialModeHandled.current) return;
    const mode = typeof params.mode === 'string' ? params.mode : undefined;
    if (!mode) return;

    initialModeHandled.current = true;

    if (mode === 'photo') {
      void pickMedia('image');
      return;
    }

    if (mode === 'reel') {
      chooseReelSource();
      return;
    }

    if (mode === 'story') {
      void captureMedia('all');
      return;
    }

    if (mode === 'live') {
      if (!LIVE_NATIVE_ENABLED) return;
      // Generate unique room ID for this broadcast
      const roomId = `live_${user?.id || 'guest'}_${Date.now().toString(36)}`;
      router.push({ pathname: '/live-native' as never, params: { room: roomId, mode: 'video' } as never });
      return;
    }
  }, [captureMedia, params.mode, pickMedia, router]);

  const onSelectCreateMode = (mode: CreateActionMode) => {
    setShowCreateMenu(false);
    initialModeHandled.current = true;
    if (mode === 'live') {
      if (!LIVE_NATIVE_ENABLED) return;
      const roomId = `live_${user?.id || 'guest'}_${Date.now().toString(36)}`;
      router.push({ pathname: '/live-native' as never, params: { room: roomId, mode: 'video' } as never });
      return;
    }
    router.setParams({ mode: mode === 'post' ? 'photo' : mode });
    if (mode === 'post') {
      void pickMedia('image');
    } else if (mode === 'reel') {
      chooseReelSource();
    } else {
      void captureMedia('all');
    }
  };

  const submit = async () => {
    if (!token || !assetUri || !assetType) return;
    Keyboard.dismiss();
    setPosting(true);
    setUploadError(null);
    setUploadProgress(5);
    setUploadStatusMessage('Preparing upload...');
    try {
      const isVideo = assetType === 'video';
      const mime = assetMime || (isVideo ? 'video/mp4' : 'image/jpeg');

      // Apply in-app framing crop, then compress photos to JPEG ≤ 1280px long edge.
      // so they stay well under any proxy body-size limit.
      let finalUri = assetUri;
      let finalMime = mime;
      if (!isVideo) {
        const metrics = getImageFrameMetrics();
        if (metrics && assetWidth && assetHeight) {
          const imageLeft = (previewWidth - metrics.shownWidth) / 2 + imageOffsetX;
          const imageTop = (previewHeight - metrics.shownHeight) / 2 + imageOffsetY;
          const cropX = Math.max(0, Math.min(assetWidth - 1, (0 - imageLeft) / metrics.totalScale));
          const cropY = Math.max(0, Math.min(assetHeight - 1, (0 - imageTop) / metrics.totalScale));
          const cropWidth = Math.max(1, Math.min(assetWidth - cropX, previewWidth / metrics.totalScale));
          const cropHeight = Math.max(1, Math.min(assetHeight - cropY, previewHeight / metrics.totalScale));

          const cropped = await ImageManipulator.manipulateAsync(
            assetUri,
            [{ crop: { originX: Math.round(cropX), originY: Math.round(cropY), width: Math.round(cropWidth), height: Math.round(cropHeight) } }],
            { compress: 1 },
          );
          finalUri = cropped.uri;
        }

        const compressed = await ImageManipulator.manipulateAsync(
          finalUri,
          [{ resize: { width: 1280 } }],
          { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
        );
        finalUri = compressed.uri;
        finalMime = 'image/jpeg';
      }

      const filename = isVideo
        ? (assetName || 'mobile-upload.mp4')
        : 'mobile-upload.jpg';

      // Keep large photos and videos on disk on native devices. Converting an
      // entire video to a web Blob can exhaust memory and its FormData part is
      // not supported by React Native. Web still requires a Blob.
      const webBlob = Platform.OS === 'web' ? await (await fetch(finalUri)).blob() : null;
      const uploadFile = Platform.OS === 'web' ? null : new File(finalUri);
      const finalSize = webBlob?.size ?? uploadFile?.size;
      if (!finalSize || finalSize < 1) {
        throw new Error('Prepared upload size is unavailable. Please select the file again.');
      }

      const publishViaMultipart = async () => {
        setUploadProgress(55);
        setUploadStatusMessage('Uploading media...');
        let fbStatus: number;
        let fbBody: string;

        if (Platform.OS === 'web') {
          const form = new FormData();
          form.append('caption', caption);
          form.append('type', isVideo ? 'VIDEO' : 'PHOTO');
          form.append('visibility', visibility);
          if (!webBlob) throw new Error('Upload file is unavailable.');
          form.append('media', webBlob, filename);

          const fbRes = await fetch(`${API_BASE_URL}/posts`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            body: form,
          });
          fbStatus = fbRes.status;
          fbBody = await fbRes.text();
        } else {
          if (!uploadFile) throw new Error('Upload file is unavailable.');
          const fbUpload = await uploadFile.upload(`${API_BASE_URL}/posts`, {
            httpMethod: 'POST',
            uploadType: UploadType.MULTIPART,
            fieldName: 'media',
            mimeType: finalMime,
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            parameters: {
              caption,
              type: isVideo ? 'VIDEO' : 'PHOTO',
              visibility,
            },
            sessionType: 'foreground',
          });
          fbStatus = fbUpload.status;
          fbBody = fbUpload.body;
        }

        if (fbStatus < 200 || fbStatus >= 300) {
          const err = (() => { try { return JSON.parse(fbBody || '{}'); } catch { return {} as any; } })();
          throw new Error(err?.message || `Failed to create post (${fbStatus})`);
        }
        setUploadProgress(100);
        setUploadStatusMessage('Published');
        const postedTypeFallback = assetType;
        resetComposer();
        setPublishedType(postedTypeFallback);
      };

      // For local development APIs, skip presigned storage and post multipart directly.
      const useDirectUpload = !API_BASE_URL.includes('localhost');
      if (isStory && !useDirectUpload) {
        throw new Error('Story creation requires cloud storage to be configured.');
      }
      if (!useDirectUpload) {
        await publishViaMultipart();
        return;
      }

      // Production uses only the presigned quarantine/moderation pipeline.
      setUploadProgress(15);
      setUploadStatusMessage('Requesting secure upload URL...');
      const createUploadRes = await fetch(`${API_BASE_URL}/media/create-upload-url`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mimeType: finalMime,
          size: finalSize,
        }),
      });

      const createUploadBody = await createUploadRes.text();

      if (!createUploadRes.ok) {
        const err = (() => {
          try { return JSON.parse(createUploadBody || '{}'); } catch { return {} as any; }
        })();
        throw new Error(err?.message || `Secure upload could not start (${createUploadRes.status})`);
      }

      const uploadTarget = JSON.parse(createUploadBody) as {
        uploadUrl: string;
        mediaId: string;
      };

      setUploadProgress(55);
      setUploadStatusMessage('Uploading media...');
      const uploadResult = uploadFile ? await uploadFile.upload(uploadTarget.uploadUrl, {
        httpMethod: 'PUT',
        uploadType: UploadType.BINARY_CONTENT,
        mimeType: finalMime,
        headers: { 'Content-Type': finalMime },
        sessionType: 'foreground',
      }) : null;

      if (Platform.OS === 'web') {
        if (!webBlob) throw new Error('Storage upload failed (missing blob)');
        const webUploadRes = await fetch(uploadTarget.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': finalMime },
          body: webBlob,
        });
        if (!webUploadRes.ok) {
          throw new Error(`Storage upload failed (${webUploadRes.status})`);
        }
      } else if (!uploadResult || uploadResult.status < 200 || uploadResult.status >= 300) {
        throw new Error(`Storage upload failed (${uploadResult?.status ?? 'unknown'})`);
      }

      setUploadProgress(75);
      setUploadStatusMessage('Finalizing upload...');
      const completeRes = await fetch(`${API_BASE_URL}/media/complete-upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mediaId: uploadTarget.mediaId }),
      });

      const completeBody = await completeRes.text();
      if (!completeRes.ok) {
        const err = (() => {
          try {
            return JSON.parse(completeBody || '{}');
          } catch {
            return {} as any;
          }
        })();
        throw new Error(err?.message || `Failed to finalize upload (${completeRes.status})`);
      }

      let completeJson: any = null;
      try {
        completeJson = JSON.parse(completeBody || '{}');
      } catch {
        completeJson = null;
      }

      const uploadStatus = completeJson?.uploadStatus;
      if (uploadStatus === 'REJECTED') {
        throw new Error(completeJson?.message || 'Media did not pass safety review.');
      }
      if (uploadStatus !== 'PUBLISHED') {
        setUploadProgress(88);
        await pollMediaUntilProcessed(API_BASE_URL, token, uploadTarget.mediaId, (message) => {
          setUploadStatusMessage(message);
        });
      }

      setUploadProgress(95);
      setUploadStatusMessage(isStory ? 'Sharing to story...' : 'Publishing post...');
      const res = await fetch(`${API_BASE_URL}/${isStory ? 'stories' : 'posts'}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          isStory
            ? { caption, visibility, mediaId: uploadTarget.mediaId }
            : { caption, type: assetType === 'video' ? 'VIDEO' : 'PHOTO', visibility, mediaId: uploadTarget.mediaId },
        ),
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
        throw new Error(err?.message || `Failed to ${isStory ? 'share story' : 'create post'} (${status})`);
      }

      setUploadProgress(100);
      setUploadStatusMessage('Published');
      const postedType = assetType;
      resetComposer();
      setPublishedType(postedType);
    } catch (e: any) {
      const rawMessage = String(e?.message || 'Could not publish post.');
      const mapped = mapUploadError(rawMessage, assetType === 'video');
      setUploadError(mapped);
      Alert.alert(mapped.title, mapped.message);
    } finally {
      setPosting(false);
      setUploadStatusMessage(null);
      setUploadProgress(0);
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
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900' }}>
                    {launchModeLabel ? `Create ${launchModeLabel}` : 'Create Post'}
                  </Text>
                  <View style={{ backgroundColor: '#7c3aed', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 }}>NEW</Text>
                  </View>
                </View>
                <Text style={{ color: '#93a1bd', marginTop: 2 }}>
                  {launchModeLabel === 'Photo'
                    ? 'Photo opens straight into your library.'
                    : launchModeLabel === 'Reel'
                      ? 'Reel opens straight into the camera.'
                      : 'Pick your audience, add a caption, and share'}
                </Text>
              </View>
              <Pressable
                onPress={() => setShowCreateMenu(true)}
                disabled={posting}
                style={({ pressed }) => ({
                  width: 44,
                  height: 44,
                  borderRadius: 16,
                  backgroundColor: pressed ? '#4338ca' : '#312e81',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: posting ? 0.6 : 1,
                })}
              >
                <MaterialCommunityIcons name="plus" size={26} color="#fff" />
              </Pressable>
            </View>

            {launchModeLabel ? (
              <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1f2a44', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: '#32405f' }}>
                <MaterialCommunityIcons name={launchModeLabel === 'Reel' ? 'video-outline' : 'image-outline'} size={14} color="#c7d2fe" />
                <Text style={{ color: '#dbe4ff', fontWeight: '800', fontSize: 12 }}>{launchModeLabel} shortcut</Text>
              </View>
            ) : null}

            {/* Audience selector pinned to the top so it is immediately visible */}
            <View style={{ gap: 8, backgroundColor: '#141b30', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#2c2f63' }}>
              <Text style={{ color: '#c4b5fd', fontWeight: '800', fontSize: 12, letterSpacing: 0.5 }}>WHO CAN SEE THIS</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {AUDIENCES.map((a) => {
                  const active = visibility === a.value;
                  return (
                    <Pressable
                      key={a.value}
                      onPress={() => setVisibility(a.value)}
                      disabled={posting}
                      style={{
                        flex: 1,
                        alignItems: 'center',
                        gap: 4,
                        paddingVertical: 12,
                        borderRadius: 14,
                        borderWidth: 2,
                        borderColor: active ? '#7c3aed' : '#28324a',
                        backgroundColor: active ? '#241b45' : '#151d33',
                        opacity: posting ? 0.6 : 1,
                      }}
                    >
                      <MaterialCommunityIcons name={a.icon} size={18} color={active ? '#c4b5fd' : '#8790ab'} />
                      <Text style={{ color: active ? '#ddd6fe' : '#93a1bd', fontWeight: '700', fontSize: 12 }}>{a.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={{ color: '#5b6680', fontSize: 12 }}>
                {AUDIENCES.find((a) => a.value === visibility)?.desc}
              </Text>
            </View>

            {publishedType && !assetUri ? (
              <View style={{ backgroundColor: '#0f2a1c', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#15803d', gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <MaterialCommunityIcons name="check-circle" size={26} color="#4ade80" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#bbf7d0', fontWeight: '900', fontSize: 16 }}>{isStory ? 'Shared!' : 'Posted!'}</Text>
                    <Text style={{ color: '#86efac', marginTop: 2, fontSize: 13 }}>
                      {isStory ? 'Your story is now live on NXQ Social.' : `Your ${publishedType === 'video' ? 'reel' : 'photo'} is now live on NXQ Social.`}
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => setPublishedType(null)}
                  style={{ backgroundColor: '#16a34a', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
                >
                  <Text style={{ color: '#fff', fontWeight: '800' }}>{isStory ? 'Create another story' : 'Create another post'}</Text>
                </Pressable>
              </View>
            ) : null}

            {posting && uploadStatusMessage ? (
              <View style={{ backgroundColor: '#111827', borderRadius: 12, padding: 10 }}>
                <Text style={{ color: '#c7d2fe', fontWeight: '700', marginBottom: 8 }}>{uploadStatusMessage}</Text>
                <View style={{ height: 8, borderRadius: 999, backgroundColor: '#1f2937', overflow: 'hidden' }}>
                  <View
                    style={{
                      width: `${Math.max(3, Math.min(100, uploadProgress))}%`,
                      height: '100%',
                      backgroundColor: '#6366f1',
                    }}
                  />
                </View>
                <Text style={{ color: '#93a1bd', marginTop: 6, fontSize: 12 }}>{Math.round(uploadProgress)}%</Text>
              </View>
            ) : null}

            {!posting && uploadError ? (
              <View style={{ backgroundColor: '#2a1620', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#7f1d1d' }}>
                <Text style={{ color: '#fecaca', fontWeight: '800' }}>{uploadError.title}</Text>
                <Text style={{ color: '#fca5a5', marginTop: 6 }}>{uploadError.message}</Text>
                {uploadError.retryable ? (
                  <Pressable
                    onPress={submit}
                    style={{ marginTop: 10, backgroundColor: '#7c3aed', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '800' }}>Retry Upload</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => captureMedia()} style={{ flex: 1, backgroundColor: '#111827', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#1f2937', alignItems: 'center', gap: 8 }}>
                <MaterialCommunityIcons name="camera-outline" size={24} color="#c7d2fe" />
                <Text style={{ color: '#c7d2fe', fontWeight: '800', textAlign: 'center' }}>Open camera</Text>
              </Pressable>
              <Pressable onPress={() => pickMedia()} style={{ flex: 1, backgroundColor: '#111827', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#1f2937', alignItems: 'center', gap: 8 }}>
                <MaterialCommunityIcons name="image-multiple-outline" size={24} color="#c7d2fe" />
                <Text style={{ color: '#c7d2fe', fontWeight: '800', textAlign: 'center' }}>{assetUri ? 'Change media' : 'Pick from library'}</Text>
              </Pressable>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => captureMedia('video')} style={{ flex: 1, backgroundColor: '#1b1c3a', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#3b3e7a', alignItems: 'center', gap: 8 }}>
                <MaterialCommunityIcons name="record-rec" size={24} color="#c7d2fe" />
                <Text style={{ color: '#c7d2fe', fontWeight: '800', textAlign: 'center' }}>Record video</Text>
              </Pressable>
              <Pressable onPress={() => pickMedia('video')} style={{ flex: 1, backgroundColor: '#1b1c3a', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#3b3e7a', alignItems: 'center', gap: 8 }}>
                <MaterialCommunityIcons name="filmstrip-box-multiple" size={24} color="#c7d2fe" />
                <Text style={{ color: '#c7d2fe', fontWeight: '800', textAlign: 'center' }}>Upload video</Text>
              </Pressable>
            </View>

            {assetUri && assetType === 'image' ? (
              <View>
                <View
                  onLayout={onPreviewLayout}
                  style={{ width: '100%', height: previewHeight, borderRadius: 12, backgroundColor: '#0b1020', overflow: 'hidden' }}
                >
                  <Image
                    source={{ uri: assetUri }}
                    style={{
                      width: '100%',
                      height: '100%',
                      transform: [
                        { scale: imageScale },
                        { translateX: imageOffsetX },
                        { translateY: imageOffsetY },
                      ],
                    }}
                    resizeMode="cover"
                  />
                </View>
                <Text style={{ color: '#93a1bd', marginTop: 8 }}>Adjust photo: move and zoom</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <Pressable onPress={() => updateScale(imageScale - 0.1)} style={{ flex: 1, backgroundColor: '#111827', borderRadius: 10, padding: 10 }}>
                    <Text style={{ color: '#c7d2fe', textAlign: 'center', fontWeight: '700' }}>Zoom -</Text>
                  </Pressable>
                  <Pressable onPress={() => updateScale(imageScale + 0.1)} style={{ flex: 1, backgroundColor: '#111827', borderRadius: 10, padding: 10 }}>
                    <Text style={{ color: '#c7d2fe', textAlign: 'center', fontWeight: '700' }}>Zoom +</Text>
                  </Pressable>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <Pressable onPress={() => adjustOffset(-16, 0)} style={{ flex: 1, backgroundColor: '#111827', borderRadius: 10, padding: 10 }}>
                    <Text style={{ color: '#c7d2fe', textAlign: 'center', fontWeight: '700' }}>Left</Text>
                  </Pressable>
                  <Pressable onPress={() => adjustOffset(16, 0)} style={{ flex: 1, backgroundColor: '#111827', borderRadius: 10, padding: 10 }}>
                    <Text style={{ color: '#c7d2fe', textAlign: 'center', fontWeight: '700' }}>Right</Text>
                  </Pressable>
                  <Pressable onPress={() => adjustOffset(0, -16)} style={{ flex: 1, backgroundColor: '#111827', borderRadius: 10, padding: 10 }}>
                    <Text style={{ color: '#c7d2fe', textAlign: 'center', fontWeight: '700' }}>Up</Text>
                  </Pressable>
                  <Pressable onPress={() => adjustOffset(0, 16)} style={{ flex: 1, backgroundColor: '#111827', borderRadius: 10, padding: 10 }}>
                    <Text style={{ color: '#c7d2fe', textAlign: 'center', fontWeight: '700' }}>Down</Text>
                  </Pressable>
                </View>
                <Pressable onPress={() => { setImageScale(1); setImageOffsetX(0); setImageOffsetY(0); }} style={{ marginTop: 8, backgroundColor: '#111827', borderRadius: 10, padding: 10 }}>
                  <Text style={{ color: '#c7d2fe', textAlign: 'center', fontWeight: '700' }}>Reset alignment</Text>
                </Pressable>
              </View>
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
              maxLength={2200}
              style={{ backgroundColor: '#151d33', color: '#fff', borderRadius: 16, padding: 14, minHeight: 104, textAlignVertical: 'top', borderWidth: 1, borderColor: '#28324a' }}
            />
            <Text style={{ color: '#5b6680', fontSize: 12, textAlign: 'right', marginTop: -4 }}>{caption.length}/2200</Text>

            <Pressable
              onPress={submit}
              disabled={!assetUri || posting}
              style={{ backgroundColor: '#4f46e5', borderRadius: 16, paddingVertical: 15, alignItems: 'center', opacity: !assetUri || posting ? 0.6 : 1 }}
            >
              {posting ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>{isStory ? 'Share to story' : 'Publish'}</Text>}
            </Pressable>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
      <CreateActionSheet visible={showCreateMenu} onClose={() => setShowCreateMenu(false)} onSelect={onSelectCreateMode} />
    </SafeAreaView>
  );
}

import { PhotoLooks, FilteredPhoto } from '@/components/PhotoLooks';
import { VideoEffectsButton } from '@/components/VideoEffectsButton';
import { EditedVideo, removeEditedVideo } from '@/modules/nxq-video-effects';
import { KeyboardDoneBar, useComposerKeyboard } from '@/components/KeyboardDoneBar';
import { colors } from '@/lib/theme';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { File, UploadType } from 'expo-file-system';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Alert,
  LayoutChangeEvent,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  PanResponder,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { API_BASE_URL, LIVE_NATIVE_ENABLED } from '@/lib/config';
import { useAuth } from '@/lib/auth';
import { CreateActionSheet, CreateActionMode } from '@/components/CreateActionSheet';
import { publishMedia, UploadDraft, VIDEO_DURATION_LIMIT_MS, VIDEO_SIZE_LIMIT } from '@/lib/media-publish';
import { CreatorDraft, readCreatorDraft, saveCreatorDraft, discardCreatorDraft } from '@/lib/creator-draft';

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

function mapUploadError(rawMessage: string, isVideo: boolean): UploadErrorView {
  const msg = rawMessage.toLowerCase();

  if (msg.includes('monthly media review capacity')) {
    return { title: 'Media Review Limit Reached', message: 'The current media review allowance has been reached. Please contact NXQ support about upload capacity.', retryable: false };
  }

  if (
    msg.includes('network request failed')
    || msg.includes('could not connect')
    || msg.includes('fetch failed')
    || msg.includes('load failed')
    || msg.includes('network error')
    || msg.includes('network connection was lost')
    || msg.includes('could not complete the connection')
  ) {
    return {
      title: 'Network Error',
      message: 'Connection was interrupted. Keep this screen open and retry to continue your upload.',
      retryable: true,
    };
  }

  if (
    msg.includes('413')
    || msg.includes('payload too large')
    || msg.includes('request entity too large')
    || msg.includes('entity too large')
    || msg.includes('too large')
    || msg.includes('exceeds limit')
    || msg.includes('must not be greater')
  ) {
    return {
      title: 'File Too Large',
      message: isVideo ? 'Choose a video under 200 MB and no longer than 10 minutes.' : 'Choose a smaller photo and try again.',
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

function VideoPreview({ uri, editing }: { uri: string; editing: boolean }) {
  const player = useVideoPlayer(uri);
  useEffect(() => { if (editing) player?.pause(); }, [editing, player]);
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
  const [photoDragging, setPhotoDragging] = useState(false);
  const photoDragOrigin = useRef({ x: 0, y: 0 });
  const photoGesture = useRef({ enabled: false, x: 0, y: 0, clamp: (x: number, y: number) => ({ x, y }) });
  const photoPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => photoGesture.current.enabled,
    onMoveShouldSetPanResponder: () => photoGesture.current.enabled,
    onPanResponderGrant: () => {
      photoDragOrigin.current = { x: photoGesture.current.x, y: photoGesture.current.y };
      setPhotoDragging(true);
    },
    onPanResponderMove: (_event, gesture) => {
      if (!photoGesture.current.enabled || gesture.numberActiveTouches !== 1) return;
      const next = photoGesture.current.clamp(photoDragOrigin.current.x + gesture.dx, photoDragOrigin.current.y + gesture.dy);
      setImageOffsetX(next.x);
      setImageOffsetY(next.y);
    },
    onPanResponderRelease: () => setPhotoDragging(false),
    onPanResponderTerminate: () => setPhotoDragging(false),
    onPanResponderTerminationRequest: () => !photoGesture.current.enabled,
    onShouldBlockNativeResponder: () => photoGesture.current.enabled,
  }), []);
  const [caption, setCaption] = useState('');
  const keyboard = useComposerKeyboard();
  const [photoEffect, setPhotoEffect] = useState<FilteredPhoto | null>(null);
  const [filterBusy, setFilterBusy] = useState(false);
  const [videoEffect, setVideoEffect] = useState<EditedVideo | null>(null);
  const [videoEditing, setVideoEditing] = useState(false);
  const videoEditingRef = useRef(false);
  const onVideoEditing = (busy: boolean) => {
    videoEditingRef.current = busy;
    setVideoEditing(busy);
    if (busy) keyboard.dismiss();
  };
  useEffect(() => {
    const uri = videoEffect?.uri;
    return () => { void removeEditedVideo(uri); };
  }, [videoEffect?.uri]);
  const photoUri = photoEffect?.uri || assetUri;
  const photoWidth = photoEffect?.width || assetWidth;
  const photoHeight = photoEffect?.height || assetHeight;
  const [visibility, setVisibility] = useState<Audience>('PUBLIC');
  const [posting, setPosting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusMessage, setUploadStatusMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<UploadErrorView | null>(null);
  const [publishedType, setPublishedType] = useState<'image' | 'video' | null>(null);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const submitting = useRef(false);
  const uploadDraft = useRef<UploadDraft | null>(null);
  const previewHeight = 260;
  const [savedDraft, setSavedDraft] = useState<CreatorDraft | null>(null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const activeDraft = useRef<string | null>(null);
  const draftScope = useRef(0);
  const draftFrame = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const current = ++draftScope.current;
    setSavedDraft(null); setDraftError(null); activeDraft.current = null;
    setAssetUri(null); setAssetType(null); setPhotoEffect(null); setVideoEffect(null);
    setCaption(''); setVisibility('PUBLIC'); setDraftBusy(false); draftFrame.current = null;
    if (Platform.OS !== 'web' && user?.id) void readCreatorDraft(user.id).then(draft => {
      if (draftScope.current === current) setSavedDraft(draft);
    }).catch(error => { if (draftScope.current === current) setDraftError(error.message); });
    return () => { draftScope.current += 1; };
  }, [user?.id]);
  useEffect(() => {
    if (draftFrame.current && previewWidth) {
      setImageOffsetX(draftFrame.current.x * previewWidth);
      setImageOffsetY(draftFrame.current.y * previewHeight);
      draftFrame.current = null;
    }
  }, [previewWidth, assetUri]);

  const restoreDraft = (draft: CreatorDraft) => {
    if (submitting.current || videoEditingRef.current) return;
    initialModeHandled.current = true;
    router.setParams({ mode: draft.isStory ? 'story' : draft.type === 'video' ? 'reel' : 'photo' });
    setAssetUri(draft.uri); setAssetType(draft.type); setAssetMime(draft.mime);
    setAssetName(draft.type === 'video' ? 'draft.mp4' : 'draft.jpg');
    setAssetWidth(draft.width); setAssetHeight(draft.height); setAssetSize(null);
    setPhotoEffect(null); setVideoEffect(null); setCaption(draft.caption); setVisibility(draft.visibility);
    setImageScale(draft.scale); draftFrame.current = { x: draft.offsetX, y: draft.offsetY };
    setImageOffsetX(draft.offsetX * previewWidth); setImageOffsetY(draft.offsetY * previewHeight);
    setUploadError(null); setPublishedType(null); uploadDraft.current = null; activeDraft.current = draft.id;
  };
  const saveDraft = async () => {
    if (!user?.id || !assetUri || !assetType || submitting.current || filterBusy || videoEditingRef.current) return;
    submitting.current = true; setDraftBusy(true); setDraftError(null); keyboard.dismiss();
    const current = draftScope.current;
    try {
      const saved = await saveCreatorDraft(user.id, {
        uri: assetType === 'video' ? videoEffect?.uri || assetUri : photoUri || assetUri,
        type: assetType, mime: assetType === 'video' ? 'video/mp4' : photoEffect ? 'image/jpeg' : assetMime || 'image/jpeg',
        caption, visibility, isStory, width: assetType === 'image' ? photoWidth : assetWidth,
        height: assetType === 'image' ? photoHeight : assetHeight,
        scale: imageScale, offsetX: previewWidth ? displayedOffsets.x / previewWidth : 0, offsetY: displayedOffsets.y / previewHeight,
      });
      if (draftScope.current !== current) return;
      setSavedDraft(saved); activeDraft.current = saved.id;
      // Use the durable copy immediately; replacing a previous draft may remove its file.
      setAssetUri(saved.uri); setAssetWidth(saved.width); setAssetHeight(saved.height);
      setPhotoEffect(null); setVideoEffect(null); setAssetMime(saved.mime); uploadDraft.current = null;
    } catch (error) { if (draftScope.current === current) setDraftError(error instanceof Error ? error.message : 'Could not save draft.'); }
    finally { submitting.current = false; if (draftScope.current === current) setDraftBusy(false); }
  };
  const discardDraft = () => Alert.alert('Discard saved draft?', 'This removes the draft from this phone. Your library original stays safe.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Discard', style: 'destructive', onPress: async () => {
      if (!user?.id || submitting.current) return;
      try {
        await discardCreatorDraft(user.id);
        if (activeDraft.current === savedDraft?.id) { activeDraft.current = null; resetComposer(); }
        setSavedDraft(null); setDraftError(null);
      } catch { setDraftError('Could not discard this draft. Please retry.'); }
    } },
  ]);

  const resetComposer = () => {
    if (activeDraft.current && user?.id) {
      const id = activeDraft.current; activeDraft.current = null;
      void discardCreatorDraft(user.id, id).then(() => setSavedDraft(current => current?.id === id ? null : current)).catch(() => setDraftError('Posted successfully, but the saved draft could not be removed.'));
    }
    setPhotoDragging(false);
    uploadDraft.current = null;
    setAssetUri(null);
    setPhotoEffect(null);
    setVideoEffect(null);
    setFilterBusy(false);
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
    if (submitting.current || videoEditingRef.current) return;
    const isVideo = asset.type === 'video';
    if (isVideo && ((asset.fileSize ?? 0) > VIDEO_SIZE_LIMIT || (asset.duration ?? 0) > VIDEO_DURATION_LIMIT_MS)) {
      Alert.alert('Video Too Large', 'Choose a video under 200 MB and no longer than 10 minutes.');
      return;
    }
    activeDraft.current = null; draftFrame.current = null;
    const fallbackName = isVideo ? 'mobile-upload.mp4' : 'mobile-upload.jpg';
    const fallbackMime = isVideo ? 'video/mp4' : 'image/jpeg';
    const supportedMime = isVideo
      ? (asset.mimeType === 'video/mp4' ? asset.mimeType : fallbackMime)
      : (asset.mimeType && /^(image\/(jpeg|png))$/.test(asset.mimeType) ? asset.mimeType : fallbackMime);

    setPhotoDragging(false);
    setAssetUri(asset.uri);
    setPhotoEffect(null);
    setVideoEffect(null);
    setFilterBusy(false);
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

  const getImageFrameMetrics = (scale = imageScale) => {
    if (!photoWidth || !photoHeight || !previewWidth) return null;
    const baseScale = Math.max(previewWidth / photoWidth, previewHeight / photoHeight);
    const totalScale = baseScale * scale;
    const shownWidth = photoWidth * totalScale;
    const shownHeight = photoHeight * totalScale;
    const maxOffsetX = Math.max(0, (shownWidth - previewWidth) / 2);
    const maxOffsetY = Math.max(0, (shownHeight - previewHeight) / 2);
    return { baseScale, totalScale, shownWidth, shownHeight, maxOffsetX, maxOffsetY };
  };

  const clampOffsets = (nextX: number, nextY: number, scale = imageScale) => {
    const metrics = getImageFrameMetrics(scale);
    if (!metrics) return { x: nextX, y: nextY };
    return {
      x: Math.min(metrics.maxOffsetX, Math.max(-metrics.maxOffsetX, nextX)),
      y: Math.min(metrics.maxOffsetY, Math.max(-metrics.maxOffsetY, nextY)),
    };
  };

  const frameMetrics = getImageFrameMetrics();
  const displayedOffsets = clampOffsets(imageOffsetX, imageOffsetY);
  photoGesture.current = {
    enabled: assetType === 'image' && Boolean(assetUri && assetWidth && assetHeight && previewWidth) && !posting,
    x: displayedOffsets.x,
    y: displayedOffsets.y,
    clamp: clampOffsets,
  };

  const updateScale = (nextScale: number) => {
    const scale = Math.min(3, Math.max(1, nextScale));
    const next = clampOffsets(imageOffsetX, imageOffsetY, scale);
    setImageScale(scale);
    setImageOffsetX(next.x);
    setImageOffsetY(next.y);
  };

  const pickMedia = async (mode: 'all' | 'video' | 'image' = 'all') => {
    if (submitting.current) return;
    keyboard.dismiss();
    try {
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
      // Use the modern iOS picker for videos and export a local H.264 MP4.
      // Passthrough can return an iCloud-only or incompatible MOV resource.
      allowsEditing: mode === 'image',
      videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      shouldDownloadFromNetwork: true,
      quality: 1,
    });

    if (result.canceled || !result.assets?.length) return;
    storeSelectedAsset(result.assets[0]);
    } catch {
      Alert.alert('Could not open media', 'NXQ could not prepare this file. If it is stored in iCloud, open it in Photos and let it download, then try again.');
    }
  };

  const captureMedia = async (mode: 'all' | 'video' | 'image' = 'all') => {
    if (submitting.current) return;
    keyboard.dismiss();
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
    if (submitting.current || filterBusy || videoEditingRef.current || !token || !assetUri || !assetType) return;
    submitting.current = true;
    keyboard.dismiss();
    setPhotoDragging(false);
    setPosting(true);
    setUploadError(null);
    setUploadProgress(5);
    setUploadStatusMessage('Preparing upload...');
    try {
      const isVideo = assetType === 'video';
      const mime = assetMime || (isVideo ? 'video/mp4' : 'image/jpeg');

      // Apply in-app framing crop, then compress photos to JPEG ≤ 1280px long edge.
      // so they stay well under any proxy body-size limit.
      let finalUri = isVideo ? (videoEffect?.uri || assetUri) : (photoUri || assetUri);
      let finalMime = isVideo && videoEffect ? 'video/mp4' : mime;
      if (!isVideo) {
        const metrics = getImageFrameMetrics();
        if (metrics && photoWidth && photoHeight) {
          const imageLeft = (previewWidth - metrics.shownWidth) / 2 + displayedOffsets.x;
          const imageTop = (previewHeight - metrics.shownHeight) / 2 + displayedOffsets.y;
          const cropX = Math.max(0, Math.min(photoWidth - 1, (0 - imageLeft) / metrics.totalScale));
          const cropY = Math.max(0, Math.min(photoHeight - 1, (0 - imageTop) / metrics.totalScale));
          const cropWidth = Math.max(1, Math.min(photoWidth - cropX, previewWidth / metrics.totalScale));
          const cropHeight = Math.max(1, Math.min(photoHeight - cropY, previewHeight / metrics.totalScale));

          const cropped = await ImageManipulator.manipulateAsync(
            finalUri,
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
        ? (videoEffect ? 'nxq-video.mp4' : (assetName || 'mobile-upload.mp4'))
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

      await publishMedia({
        token,
        fingerprint: JSON.stringify([user?.id, assetUri, photoEffect?.uri, videoEffect?.uri, isStory, imageScale, imageOffsetX, imageOffsetY, previewWidth, assetWidth, assetHeight]),
        draft: uploadDraft,
        mimeType: finalMime,
        size: finalSize,
        caption,
        visibility,
        isStory,
        onStatus: (progress, message) => {
          setUploadProgress(progress);
          setUploadStatusMessage(message);
        },
        transfer: async (url) => {
          if (uploadFile) {
            const result = await uploadFile.upload(url, {
              httpMethod: 'PUT', uploadType: UploadType.BINARY_CONTENT,
              mimeType: finalMime, headers: { 'Content-Type': finalMime },
              sessionType: 'foreground',
              onProgress: ({ bytesSent, totalBytes }) => {
                if (totalBytes > 0) setUploadProgress(20 + Math.min(1, bytesSent / totalBytes) * 50);
              },
            });
            if (result.status < 200 || result.status >= 300) throw new Error('Storage upload failed (' + result.status + ')');
          } else {
            if (!webBlob) throw new Error('Upload file is unavailable.');
            const result = await fetch(url, { method: 'PUT', headers: { 'Content-Type': finalMime }, body: webBlob });
            if (!result.ok) throw new Error('Storage upload failed (' + result.status + ')');
          }
        },
      });

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
      submitting.current = false;
      setPosting(false);
      setUploadStatusMessage(null);
      setUploadProgress(0);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 14 : 0}
      >
          <ScrollView
            pointerEvents={draftBusy ? 'none' : 'auto'}
            scrollEnabled={!photoDragging}
            contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: 28 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View><Text style={{ color: colors.text, fontSize: 30, fontWeight: '900', letterSpacing: -0.8 }}>Create</Text>
                <Text style={{ color: colors.muted, marginTop: 4 }}>Make a moment worth sharing.</Text></View>
              <Pressable accessibilityRole="button" accessibilityLabel="Creation options" disabled={posting} onPress={() => { keyboard.dismiss(); setShowCreateMenu(true); }} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }}>
                <MaterialCommunityIcons name="dots-horizontal" size={24} color={colors.text} />
              </Pressable>
            </View>
            {Platform.OS !== 'web' ? <View style={{ borderRadius: 18, backgroundColor: colors.surface, padding: 14, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><MaterialCommunityIcons name="file-document-edit-outline" size={20} color={colors.accent} /><Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>Your draft</Text></View>
              <Text style={{ color: colors.muted, lineHeight: 20 }}>{savedDraft ? `${savedDraft.type === 'video' ? 'Video' : 'Photo'} saved ${new Date(savedDraft.savedAt).toLocaleDateString()}. Only on this phone, for this account.` : 'Save one photo or video with its current look, framing, caption and audience. Resume it after restarting NXQ.'}</Text>
              {draftError ? <Text accessibilityRole="alert" style={{ color: '#fca5a5' }}>{draftError}</Text> : null}
              <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
                {assetUri ? <Pressable accessibilityRole="button" disabled={posting || filterBusy || videoEditing || draftBusy} onPress={() => savedDraft && activeDraft.current !== savedDraft.id ? Alert.alert('Replace saved draft?', 'You can keep one draft on this phone. Saving this will replace the previous draft.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Replace', onPress: () => void saveDraft() }]) : void saveDraft()} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.accent, fontWeight: '800' }}>{draftBusy ? 'Saving draft…' : 'Save draft'}</Text></Pressable> : null}
                {savedDraft && !assetUri ? <Pressable accessibilityRole="button" disabled={posting || draftBusy} onPress={() => restoreDraft(savedDraft)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.accent, fontWeight: '800' }}>Resume draft</Text></Pressable> : null}
                {savedDraft || draftError ? <Pressable accessibilityRole="button" disabled={posting || draftBusy || videoEditing} onPress={discardDraft} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.muted }}>Discard draft</Text></Pressable> : null}
              </View>
            </View> : null}
            <View style={{ flexDirection: 'row', gap: 10, marginVertical: 4 }}>
              <Pressable disabled={posting} accessibilityRole="button" onPress={() => pickMedia('image')} style={{ paddingVertical: 12, paddingHorizontal: 18, borderRadius: 24, backgroundColor: assetType === 'image' ? colors.accent : colors.surface }}><Text style={{ color: '#fff', fontWeight: '800' }}>Photo</Text></Pressable>
              <Pressable disabled={posting} accessibilityRole="button" onPress={chooseReelSource} style={{ paddingVertical: 12, paddingHorizontal: 18, borderRadius: 24, backgroundColor: assetType === 'video' && !isStory ? colors.accent : colors.surface }}><Text style={{ color: '#fff', fontWeight: '800' }}>Video</Text></Pressable>
              <Pressable disabled={posting} accessibilityRole="button" onPress={() => onSelectCreateMode('story')} style={{ paddingVertical: 12, paddingHorizontal: 18, borderRadius: 24, backgroundColor: isStory ? colors.accent : colors.surface }}><Text style={{ color: '#fff', fontWeight: '800' }}>Story</Text></Pressable>
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
                  <Text style={{ color: colors.text, fontWeight: '800' }}>{isStory ? 'Create another story' : 'Create another post'}</Text>
                </Pressable>
              </View>
            ) : null}

            {posting && uploadStatusMessage ? (
              <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 10 }}>
                <Text style={{ color: colors.verified, fontWeight: '700', marginBottom: 8 }}>{uploadStatusMessage}</Text>
                <View style={{ height: 8, borderRadius: 999, backgroundColor: colors.raised, overflow: 'hidden' }}>
                  <View
                    style={{
                      width: `${Math.max(3, Math.min(100, uploadProgress))}%`,
                      height: '100%',
                      backgroundColor: colors.accent,
                    }}
                  />
                </View>
                <Text style={{ color: colors.muted, marginTop: 6, fontSize: 12 }}>{Math.round(uploadProgress)}%</Text>
              </View>
            ) : null}

            {!posting && uploadError ? (
              <View style={{ backgroundColor: '#2a1620', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#7f1d1d' }}>
                <Text style={{ color: '#fecaca', fontWeight: '800' }}>{uploadError.title}</Text>
                <Text style={{ color: '#fca5a5', marginTop: 6 }}>{uploadError.message}</Text>
                {uploadError.retryable ? (
                  <Pressable
                    onPress={submit}
                    style={{ marginTop: 10, backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
                  >
                    <Text style={{ color: colors.text, fontWeight: '800' }}>Continue Upload</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {!assetUri ? <>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable accessibilityRole="button" onPress={() => captureMedia()} style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 12, minHeight: 60, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
                <MaterialCommunityIcons name="camera-outline" size={24} color={colors.verified} />
                <Text style={{ color: colors.verified, fontWeight: '600', fontSize: 12, textAlign: 'center' }}>Open camera</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => pickMedia()} style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 12, minHeight: 60, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
                <MaterialCommunityIcons name="image-multiple-outline" size={24} color={colors.verified} />
                <Text style={{ color: colors.verified, fontWeight: '600', fontSize: 12, textAlign: 'center' }}>{assetUri ? 'Change media' : 'Pick from library'}</Text>
              </Pressable>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable accessibilityRole="button" onPress={() => captureMedia('video')} style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 12, minHeight: 60, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
                <MaterialCommunityIcons name="record-rec" size={24} color={colors.verified} />
                <Text style={{ color: colors.verified, fontWeight: '600', fontSize: 12, textAlign: 'center' }}>Record video</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => pickMedia('video')} style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 12, minHeight: 60, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
                <MaterialCommunityIcons name="filmstrip-box-multiple" size={24} color={colors.verified} />
                <Text style={{ color: colors.verified, fontWeight: '600', fontSize: 12, textAlign: 'center' }}>Upload video</Text>
              </Pressable>
            </View>

            <Text style={{ color: colors.muted, fontSize: 12 }}>Videos: up to 200 MB and 10 minutes. Keep NXQ open while uploading.</Text>

            </> : <Pressable accessibilityRole="button" disabled={posting || filterBusy} onPress={() => pickMedia()} style={{ alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.verified, fontWeight: '700' }}>Change media</Text></Pressable>}

            {assetUri && assetType === 'image' ? (
              <View>
                <View
                  {...photoPanResponder.panHandlers}
                  testID="photo-adjustment-frame"
                  accessibilityLabel="Photo preview. Drag to reposition the photo."
                  onLayout={onPreviewLayout}
                  style={{ width: '100%', height: previewHeight, borderRadius: 24, backgroundColor: colors.background, overflow: 'hidden' }}
                >
                  <Image
                    source={{ uri: photoUri || assetUri }}
                    style={frameMetrics ? {
                      position: 'absolute',
                      width: frameMetrics.shownWidth,
                      height: frameMetrics.shownHeight,
                      left: (previewWidth - frameMetrics.shownWidth) / 2 + displayedOffsets.x,
                      top: (previewHeight - frameMetrics.shownHeight) / 2 + displayedOffsets.y,
                    } : { width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                </View>
                <PhotoLooks key={assetUri} uri={assetUri} width={assetWidth || 1} height={assetHeight || 1} disabled={posting} onChange={setPhotoEffect} onBusy={setFilterBusy} />
                <Text style={{ color: colors.muted, marginTop: 8 }}>Drag the photo to reposition. Use zoom to adjust the crop.</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <Pressable onPress={() => updateScale(imageScale - 0.1)} style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 10, padding: 10 }}>
                    <Text style={{ color: colors.verified, textAlign: 'center', fontWeight: '700' }}>Zoom -</Text>
                  </Pressable>
                  <Pressable onPress={() => updateScale(imageScale + 0.1)} style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 10, padding: 10 }}>
                    <Text style={{ color: colors.verified, textAlign: 'center', fontWeight: '700' }}>Zoom +</Text>
                  </Pressable>
                </View>
                <Pressable onPress={() => { setImageScale(1); setImageOffsetX(0); setImageOffsetY(0); }} style={{ marginTop: 8, backgroundColor: colors.surface, borderRadius: 10, padding: 10 }}>
                  <Text style={{ color: colors.verified, textAlign: 'center', fontWeight: '700' }}>Reset alignment</Text>
                </Pressable>
              </View>
            ) : null}

            {assetUri && assetType === 'video' ? (
              <View style={{ gap: 12 }}>
                <VideoPreview key={videoEffect?.uri || assetUri} uri={videoEffect?.uri || assetUri} editing={videoEditing} />
                <VideoEffectsButton key={assetUri} uri={assetUri} value={videoEffect} disabled={posting || videoEditing} onChange={setVideoEffect} onBusy={onVideoEditing} />
              </View>
            ) : null}

            <TextInput
              ref={keyboard.inputRef}
              onFocus={keyboard.onFocus}
              onBlur={keyboard.onBlur}
              editable={!posting}
              accessibilityLabel="Caption"
              value={caption}
              onChangeText={setCaption}
              placeholder="Write a caption"
              placeholderTextColor="#8790ab"
              multiline
              maxLength={2200}
              style={{ backgroundColor: colors.raised, color: colors.text, borderRadius: 16, padding: 14, minHeight: 88, textAlignVertical: 'top', borderWidth: 1, borderColor: '#28324a' }}
            />
            <Text style={{ color: colors.muted, fontSize: 12, textAlign: 'right', marginTop: -4 }}>{caption.length}/2200</Text>

            {/* Audience remains explicit before publishing. */}
            <View style={{ gap: 8, backgroundColor: colors.surface, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.verified, fontWeight: '600', fontSize: 11, letterSpacing: 0.5 }}>AUDIENCE</Text>
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
                        flexDirection: 'row',
                        justifyContent: 'center',
                        gap: 4,
                        minHeight: 44,
                        paddingVertical: 7,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: active ? colors.accent : '#28324a',
                        backgroundColor: active ? '#241b45' : colors.raised,
                        opacity: posting ? 0.6 : 1,
                      }}
                    >
                      <MaterialCommunityIcons name={a.icon} size={18} color={active ? colors.verified : '#8790ab'} />
                      <Text style={{ color: active ? '#ddd6fe' : colors.muted, fontWeight: '700', fontSize: 12 }}>{a.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {AUDIENCES.find((a) => a.value === visibility)?.desc}
              </Text>
            </View>

            <Pressable
              onPress={submit}
              disabled={!assetUri || posting || filterBusy || videoEditing}
              style={{ backgroundColor: colors.accent, borderRadius: 16, paddingVertical: 15, alignItems: 'center', opacity: !assetUri || posting || filterBusy || videoEditing ? 0.6 : 1 }}
            >
              {posting ? <ActivityIndicator color={colors.text} /> : <Text style={{ color: colors.text, fontWeight: '800' }}>{isStory ? 'Share to story' : 'Publish'}</Text>}
            </Pressable>
          </ScrollView>
        <KeyboardDoneBar visible={keyboard.visible} onDone={keyboard.dismiss} />
      </KeyboardAvoidingView>
      <CreateActionSheet visible={showCreateMenu} onClose={() => setShowCreateMenu(false)} onSelect={onSelectCreateMode} />
    </SafeAreaView>
  );
}

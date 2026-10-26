import React from 'react';
import { Image, PanResponder, PanResponderCallbacks, ScrollView, Alert, Keyboard } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import CreateScreen from '../app/(tabs)/create';
import { PhotoLooks } from '../components/PhotoLooks';
import { VideoEffectsButton } from '../components/VideoEffectsButton';
import * as ImagePicker from 'expo-image-picker';
import { publishMedia } from '../lib/media-publish';
import { readCreatorDraft, saveCreatorDraft } from '../lib/creator-draft';
jest.mock('@/lib/creator-draft', () => ({ readCreatorDraft: jest.fn(async () => null), saveCreatorDraft: jest.fn(), discardCreatorDraft: jest.fn(async () => {}) }));

const mockVideoRemove = jest.fn(async (_uri?: string) => {});
const mockFileUpload = jest.fn(async () => ({ status: 200 }));
const mockOpenedFiles: string[] = [];
jest.mock('@/modules/nxq-video-effects', () => ({ videoEffectsAvailable: true, removeEditedVideo: (uri: string) => mockVideoRemove(uri), editVideo: jest.fn() }));

const mockRouter = { push: jest.fn(), replace: jest.fn(), setParams: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({}) }));
jest.mock('@/lib/auth', () => ({ useAuth: () => ({ token: 'fixture-only', user: { id: 'fixture' } }) }));
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'MockIcon' }));
jest.mock('@/components/CreateActionSheet', () => ({ CreateActionSheet: () => null }));
jest.mock('react-native-webview', () => ({ WebView: 'MockWebView' }));
jest.mock('expo-video', () => ({ useVideoPlayer: jest.fn(), VideoView: 'MockVideo' }));
jest.mock('expo-file-system', () => ({ File: class { size = 512; upload = mockFileUpload; constructor(uri: string) { mockOpenedFiles.push(uri); } }, UploadType: {} }));
jest.mock('expo-image-manipulator', () => ({ manipulateAsync: jest.fn(async () => ({uri:'file:///prepared.jpg'})), SaveFormat: { JPEG:'jpeg' } }));
jest.mock('@/lib/media-publish', () => ({ publishMedia: jest.fn(async () => { throw new Error('Stop before upload'); }), VIDEO_SIZE_LIMIT:200000000, VIDEO_DURATION_LIMIT_MS:600000 }));
jest.mock('expo-image-picker', () => ({
 requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted:true })),
 launchImageLibraryAsync: jest.fn(async () => ({canceled:false,assets:[{uri:'file:///fixture.jpg',type:'image',width:1000,height:500,fileSize:512,mimeType:'image/jpeg'}]})),
 VideoExportPreset:{H264_1280x720:'fixture'}, UIImagePickerPreferredAssetRepresentationMode:{Compatible:'fixture'},
}));
let responder: PanResponderCallbacks;
beforeEach(() => {
 jest.mocked(readCreatorDraft).mockResolvedValue(null);
 jest.spyOn(Alert,'alert').mockImplementation(() => {});
 jest.spyOn(PanResponder,'create').mockImplementation(config => {responder=config; return {panHandlers:{}};});
 jest.mocked(ImageManipulator.manipulateAsync).mockClear();
});

test('a saved draft resumes its caption, audience and photo framing after remount', async () => {
 jest.mocked(readCreatorDraft).mockResolvedValue({ id: 'draft-1', uri: 'file:///documents/draft.jpg', type: 'image', mime: 'image/jpeg', caption: 'Saved family photo', visibility: 'FOLLOWERS', width: 1000, height: 500, scale: 1, offsetX: 0.1, offsetY: 0, isStory: false, savedAt: '2026-10-21T10:00:00Z' });
 render(<CreateScreen />);
 await waitFor(() => expect(screen.getByText('Resume draft')).toBeTruthy());
 fireEvent.press(screen.getByText('Resume draft'));
 fireEvent(screen.getByTestId('photo-adjustment-frame'), 'layout', { nativeEvent: { layout: { width: 300, height: 260 } } });
 expect(screen.getByPlaceholderText('Write a caption').props.value).toBe('Saved family photo');
 expect(photoStyle().left).toBeCloseTo(-80);
 expect(mockRouter.setParams).toHaveBeenCalledWith({ mode: 'photo' });
});

test('saving captures the current caption, look and framing without publishing', async () => {
 jest.mocked(saveCreatorDraft).mockImplementation(async (_id, draft) => ({ ...draft, id: 'saved-1', uri: 'file:///documents/saved.jpg', savedAt: '2026-10-21T10:00:00Z' }));
 await prepare();
 fireEvent.changeText(screen.getByPlaceholderText('Write a caption'), 'Keep this moment');
 gesture('onPanResponderGrant'); gesture('onPanResponderMove', 30); gesture('onPanResponderRelease');
 await act(async () => { fireEvent.press(screen.getByText('Save draft')); });
 expect(saveCreatorDraft).toHaveBeenCalledWith('fixture', expect.objectContaining({ caption: 'Keep this moment', offsetX: 0.1, type: 'image' }));
 expect(publishMedia).not.toHaveBeenCalled();
 expect(screen.getByText(/Photo saved/)).toBeTruthy();
});
async function prepare() {
 render(<CreateScreen />);
 fireEvent.press(screen.getByText('Pick from library'));
 await waitFor(() => expect(screen.getByTestId('photo-adjustment-frame')).toBeTruthy());
 fireEvent(screen.getByTestId('photo-adjustment-frame'),'layout',{nativeEvent:{layout:{width:300,height:260}}});
}
function gesture(name: keyof PanResponderCallbacks, dx=0, dy=0) {
 act(() => (responder[name] as Function)?.({}, {dx,dy,numberActiveTouches:1}));
}
function photoStyle() { return screen.getByTestId('photo-adjustment-frame').findByType(Image).props.style; }
test('drag tracks the finger without accumulating deltas and releases page scrolling', async () => {
 await prepare();
 expect(photoStyle().left).toBe(-110);
 gesture('onPanResponderGrant');
 expect(screen.UNSAFE_getAllByType(ScrollView)[0].props.scrollEnabled).toBe(false);
 gesture('onPanResponderMove',40);
 expect(photoStyle().left).toBe(-70);
 gesture('onPanResponderMove',50);
 expect(photoStyle().left).toBe(-60);
 gesture('onPanResponderRelease');
 expect(screen.UNSAFE_getAllByType(ScrollView)[0].props.scrollEnabled).toBe(true);
 gesture('onPanResponderGrant'); gesture('onPanResponderMove',10);
 expect(photoStyle().left).toBe(-50);
 gesture('onPanResponderTerminate');
 expect(screen.UNSAFE_getAllByType(ScrollView)[0].props.scrollEnabled).toBe(true);
});
test('drag bounds, zooming out and reset never expose space outside the image', async () => {
 await prepare();fireEvent.press(screen.getByText('Zoom +'));
 gesture('onPanResponderGrant');gesture('onPanResponderMove',9999,9999);gesture('onPanResponderRelease');
 expect(photoStyle().left).toBeCloseTo(0);expect(photoStyle().top).toBeCloseTo(0);
 fireEvent.press(screen.getByText('Zoom -'));
 expect(photoStyle().left).toBeCloseTo(0);expect(photoStyle().top).toBeCloseTo(0);
 fireEvent.press(screen.getByText('Reset alignment'));
 expect(photoStyle().left).toBe(-110);expect(photoStyle().top).toBe(0);
});
test('saved crop matches the dragged, zoomed preview without publishing', async () => {
 await prepare();fireEvent.press(screen.getByText('Zoom +'));
 gesture('onPanResponderGrant');gesture('onPanResponderMove',100);gesture('onPanResponderRelease');
 const style=photoStyle();const scale=style.width/1000;
 await act(async () => { fireEvent.press(screen.getByText('Publish')); });
 await waitFor(() => expect(ImageManipulator.manipulateAsync).toHaveBeenCalled());
 expect(jest.mocked(ImageManipulator.manipulateAsync).mock.calls[0][1]).toEqual([{crop:{
  originX:Math.round(-style.left/scale),originY:Math.round(-style.top/scale),width:Math.round(300/scale),height:Math.round(260/scale),
 }}]);
});

test('caption Done hides the keyboard while preserving the caption', () => {
 const dismiss=jest.spyOn(Keyboard,'dismiss');
 render(<CreateScreen />);
 const input=screen.getByLabelText('Caption');
 fireEvent.changeText(input,'A moment with family'); fireEvent(input,'focus');
 fireEvent.press(screen.getByLabelText('Done editing. Hide keyboard'));
 expect(dismiss).toHaveBeenCalled(); expect(input.props.value).toBe('A moment with family');
});

test('publishing waits for the filter and crops the rendered file in its actual pixel dimensions', async () => {
 await prepare();
 const effects=screen.UNSAFE_getByType(PhotoLooks);
 act(()=>effects.props.onBusy(true));
 fireEvent.press(screen.getByText('Publish'));
 expect(ImageManipulator.manipulateAsync).not.toHaveBeenCalled();
 act(()=>{effects.props.onChange({uri:'file:///rendered-look.jpg',width:500,height:250}); effects.props.onBusy(false);});
 const style=photoStyle(); const scale=style.width/500;
 await act(async()=>fireEvent.press(screen.getByText('Publish')));
 expect(jest.mocked(ImageManipulator.manipulateAsync).mock.calls[0]).toEqual([
  'file:///rendered-look.jpg', [{crop:{originX:Math.max(0,Math.round(-style.left/scale)),originY:Math.max(0,Math.round(-style.top/scale)),width:Math.round(300/scale),height:Math.round(260/scale)}}], {compress:1},
 ]);
});

test('video publish waits for effects and transfers the rendered MP4 with a distinct retry fingerprint', async () => {
 jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({canceled:false,assets:[{uri:'file:///original.mp4',type:'video',width:1080,height:1920,fileSize:512,mimeType:'video/mp4',duration:10000}]} as any);
 jest.mocked(publishMedia).mockClear(); mockOpenedFiles.length = 0;
 render(<CreateScreen />); fireEvent.press(screen.getByText('Pick from library'));
 await waitFor(() => expect(screen.UNSAFE_getByType(VideoEffectsButton)).toBeTruthy());
 const editor = screen.UNSAFE_getByType(VideoEffectsButton);
 act(() => editor.props.onBusy(true)); fireEvent.press(screen.getByText('Publish'));
 expect(publishMedia).not.toHaveBeenCalled();
 const value = {canceled:false,uri:'file:///rendered-video.mp4',width:720,height:1280,size:512,duration:10000,effects:{look:'vivid',intensity:0.7,smooth:0.3,glow:0.2}};
 act(() => { editor.props.onChange(value); editor.props.onBusy(false); });
 await act(async () => fireEvent.press(screen.getByText('Publish')));
 expect(mockOpenedFiles).toContain('file:///rendered-video.mp4');
 expect(publishMedia).toHaveBeenCalledWith(expect.objectContaining({mimeType:'video/mp4',fingerprint:expect.stringContaining('file:///rendered-video.mp4')}));
 // The failed publish keeps the same edited clip for retry.
 expect(screen.UNSAFE_getByType(VideoEffectsButton).props.value).toEqual(value);
 act(() => screen.UNSAFE_getByType(VideoEffectsButton).props.onChange(null));
 expect(mockVideoRemove).toHaveBeenCalledWith('file:///rendered-video.mp4');
});

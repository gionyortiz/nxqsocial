import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import { colors } from '@/lib/theme';

export function useComposerKeyboard() {
  const inputRef = useRef<TextInput>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const dismiss = () => {
    inputRef.current?.blur();
    Keyboard.dismiss();
    setVisible(false);
  };
  return { inputRef, visible, dismiss, onFocus: () => setVisible(true), onBlur: () => setVisible(false) };
}

export function KeyboardDoneBar({ visible, onDone }: { visible: boolean; onDone: () => void }) {
  if (!visible) return null;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', backgroundColor: colors.surface, borderTopWidth: 1, borderColor: colors.border }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Done editing. Hide keyboard" onPress={onDone}
        style={{ minHeight: 44, paddingHorizontal: 20, justifyContent: 'center' }}>
        <Text style={{ color: colors.verified, fontSize: 16, fontWeight: '700' }}>Done</Text>
      </Pressable>
    </View>
  );
}

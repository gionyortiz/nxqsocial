import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '@/lib/theme';

export function ReelsToolbar({ mode, onMode, autoScroll, onToggle }: {
  mode: 'FOR_YOU' | 'FOLLOWING'; onMode: (mode: 'FOR_YOU' | 'FOLLOWING') => void; autoScroll: boolean; onToggle: () => void;
}) {
  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 8, backgroundColor: '#08090d' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 22 }}>
        {(['FOLLOWING', 'FOR_YOU'] as const).map((value) => (
          <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: mode === value }} onPress={() => onMode(value)}
            style={{ minHeight: 48, justifyContent: 'center', borderBottomWidth: 3, borderColor: mode === value ? colors.accent : 'transparent' }}>
            <Text style={{ color: mode === value ? '#fff' : '#aaa8b3', fontSize: 17, fontWeight: '800' }}>{value === 'FOR_YOU' ? 'For You' : 'Following'}</Text>
          </Pressable>
        ))}
        <View style={{ flex: 1 }} />
        <Pressable accessibilityRole="switch" accessibilityLabel="Auto-scroll" accessibilityState={{ checked: autoScroll }}
          accessibilityHint="Advance to the next video when it finishes" onPress={onToggle}
          style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
          <MaterialCommunityIcons name={autoScroll ? 'toggle-switch' : 'toggle-switch-off-outline'} size={28} color={autoScroll ? colors.accent : colors.muted} />
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>Auto-scroll {autoScroll ? 'on' : 'off'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

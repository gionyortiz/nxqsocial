import { Modal, Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export type CreateActionMode = 'post' | 'reel' | 'story' | 'live';

const OPTIONS: { mode: CreateActionMode; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; color: string }[] = [
  { mode: 'live', label: 'Live', icon: 'video-wireless-outline', color: '#6ee7b7' },
  { mode: 'reel', label: 'Reel', icon: 'movie-open-play-outline', color: '#93c5fd' },
  { mode: 'story', label: 'Story', icon: 'circle-multiple-outline', color: '#fbbf24' },
  { mode: 'post', label: 'Post', icon: 'image-outline', color: '#fda4af' },
];

export function CreateActionSheet({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (mode: CreateActionMode) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: '#0f172a',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: 16,
            paddingBottom: 32,
            gap: 10,
          }}
        >
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#334155', marginBottom: 6 }} />
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16, marginBottom: 4 }}>Create</Text>
          {OPTIONS.map((opt) => (
            <Pressable
              key={opt.mode}
              onPress={() => onSelect(opt.mode)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                backgroundColor: '#151d33',
                borderRadius: 14,
                paddingVertical: 14,
                paddingHorizontal: 16,
              }}
            >
              <MaterialCommunityIcons name={opt.icon} size={22} color={opt.color} />
              <Text style={{ color: '#e2e8f0', fontWeight: '800', fontSize: 15 }}>{opt.label}</Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

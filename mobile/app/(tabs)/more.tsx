import { colors } from '@/lib/theme';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, SafeAreaView, ScrollView, Text, View } from 'react-native';

function MenuButton({
  title,
  subtitle,
  icon,
  accent,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  accent: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: colors.surface,
        borderRadius: 18,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: colors.raised,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <View style={{ width: 44, height: 44, borderRadius: 15, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }}>
        <MaterialCommunityIcons name={icon} size={24} color={colors.text} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: '900', fontSize: 15 }}>{title}</Text>
        <Text style={{ color: colors.muted, marginTop: 4 }}>{subtitle}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={24} color="#64748b" />
    </Pressable>
  );
}

export default function MoreScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 34 }}>
        <Text style={{ color: colors.text, fontSize: 32, fontWeight: '900', marginBottom: 4, letterSpacing: -0.6 }}>More</Text>
        <Text style={{ color: colors.muted, marginBottom: 16, fontSize: 14 }}>Your NXQ tools in one place</Text>

        <View style={{ backgroundColor: colors.surface, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 16 }}>
          <Text style={{ color: colors.text, fontWeight: '900', fontSize: 18 }}>NXQ Social</Text>
          <Text style={{ color: '#b9c7df', marginTop: 5, lineHeight: 20 }}>Create, discover, and manage your account without the clutter.</Text>
        </View>

        <MenuButton title="Messages" subtitle="Keep in touch with your people" icon="message-text-outline" accent={colors.accentSoft} onPress={() => router.push('/(tabs)/messages')} />
        <MenuButton title="Notifications" subtitle="Follows, likes, comments, and mentions" icon="bell-outline" accent={colors.accent} onPress={() => router.push('/notifications' as any)} />
        <MenuButton title="Explore" subtitle="Find creators and discover posts" icon="compass-outline" accent="#0891b2" onPress={() => router.push('/explore' as any)} />
        <MenuButton title="Feedback" subtitle="Report issues and send product feedback" icon="message-alert-outline" accent="#ca8a04" onPress={() => router.push('/feedback')} />
        <MenuButton title="Settings" subtitle="Manage account and safety tools" icon="account-cog-outline" accent="#475569" onPress={() => router.push('/(tabs)/profile')} />
        <MenuButton title="Password & security" subtitle="Change your account password" icon="lock-outline" accent={colors.accentSoft} onPress={() => router.push('/change-password' as never)} />

        <MenuButton title="App updates" subtitle="See which update this phone is running" icon="cellphone-arrow-down" accent={colors.accentSoft} onPress={() => router.push('/app-updates' as never)} />
        <Text style={{ color: '#64748b', textAlign: 'center', marginTop: 18, fontSize: 12 }}>NXQ Social · Creator update</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

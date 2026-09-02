import { Linking, Pressable, Text, View } from 'react-native';
import { WEB_BASE_URL } from '@/lib/config';

export function AuthLegal() {
  return <View style={{ gap: 10 }}>
    <Text style={{ color: '#aebbd2', lineHeight: 20 }}>Please review our rules. Objectionable content and abusive behavior are not tolerated.</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {[
        ['Terms of Service', '/terms'], ['Community Guidelines', '/community-guidelines'], ['Privacy Policy', '/privacy'],
      ].map(([label, path]) => <Pressable key={path} accessibilityRole="link" onPress={() => { void Linking.openURL(WEB_BASE_URL + path); }} style={{ paddingVertical: 12 }}>
        <Text style={{ color: '#c4b5fd', textDecorationLine: 'underline' }}>{label}</Text>
      </Pressable>)}
    </View>
  </View>;
}

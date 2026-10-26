import { Image, Text, View } from 'react-native';
import { colors } from '@/lib/theme';
import { resolveMediaUrl } from '@/lib/api';
export function Avatar({ src, name, size = 40, ring = false }: {src?: string | null; name: string; size?: number; ring?: boolean}) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: colors.accentSoft, borderWidth: ring ? 2 : 1, borderColor: ring ? colors.verified : colors.border, alignItems: 'center', justifyContent: 'center' }}>
    {src ? <Image source={{uri: resolveMediaUrl(src)}} accessibilityLabel={name} style={{width:'100%',height:'100%'}} resizeMode="cover" /> : <Text style={{color:colors.text,fontWeight:'700',fontSize:size * .3}}>{name.slice(0,2).toUpperCase()}</Text>}
  </View>;
}

import { Redirect, Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/lib/auth';

export default function TabLayout() {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b1020' }}>
        <ActivityIndicator size="large" color="#8b5cf6" />
      </View>
    );
  }

  if (!token) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: '#6366f1',
        tabBarStyle: { backgroundColor: '#0f172a', borderTopColor: '#1f2937' },
        tabBarInactiveTintColor: '#93a1bd',
        headerStyle: { backgroundColor: '#0f172a' },
        headerTitleStyle: { color: '#fff', fontWeight: '700' },
        headerTintColor: '#fff',
      }}>
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Feed',
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="home-variant" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="compass-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="reels"
        options={{
          title: 'Reels',
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="movie-open-play" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: 'Create',
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="plus-box" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="send-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="account-circle" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="dots-grid" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}

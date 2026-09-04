jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));
jest.mock('@expo/vector-icons/Ionicons', () => 'MockIcon');
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});
jest.mock('@/lib/config', () => ({ API_BASE_URL: 'https://api.fixture.invalid/api', WEB_BASE_URL: 'https://fixture.invalid', SHOW_LOGIN_DEBUG: false }));
jest.mock('@/lib/runtimeProof', () => ({ mobileProof: jest.fn() }));
jest.mock('expo-network', () => ({ getNetworkStateAsync: jest.fn().mockResolvedValue({ type: 'WIFI' }) }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => '11111111-1111-4111-8111-111111111111') }));

// Tests must never contact the live API, send reset mail, or mutate accounts.
beforeEach(() => { global.fetch = jest.fn().mockRejectedValue(new Error('External requests blocked by test harness')); });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

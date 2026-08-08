import { Redirect, Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { colors } from '@/constants/brand';
import { useAuth } from '@/providers/auth-provider';
import { useNotifications } from '@/hooks/use-notifications';

export default function TabLayout() {
  const { user, loading } = useAuth();
  useNotifications(user?.uid);
  if (!loading && !user) return <Redirect href="/welcome" />;
  return <Tabs screenOptions={{
    headerShown: false,
    tabBarActiveTintColor: colors.teal,
    tabBarInactiveTintColor: colors.muted,
    tabBarStyle: { backgroundColor: '#081522', borderTopColor: colors.border, height: 72, paddingTop: 8, paddingBottom: 10 },
    tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
  }}>
    <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color }) => <SymbolView name="house.fill" size={22} tintColor={color} /> }} />
    <Tabs.Screen name="transactions" options={{ title: 'PackProofs', tabBarIcon: ({ color }) => <SymbolView name="shippingbox.fill" size={22} tintColor={color} /> }} />
    <Tabs.Screen name="capture" options={{ title: 'Capture', tabBarIcon: ({ color }) => <SymbolView name="camera.fill" size={22} tintColor={color} /> }} />
    <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: ({ color }) => <SymbolView name="person.crop.circle.fill" size={22} tintColor={color} /> }} />
  </Tabs>;
}

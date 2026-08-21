import { Redirect, Tabs } from 'expo-router';
import { AppIcon } from '@/components/app-icon';
import { colors } from '@/constants/brand';
import { useAuth } from '@/providers/auth-provider';
import { useNotifications } from '@/hooks/use-notifications';

export default function TabLayout() {
  const { user, sessionReady, loading } = useAuth();
  useNotifications(user?.uid);
  if (loading) return null;
  if (!sessionReady) return <Redirect href="/welcome" />;
  return <Tabs screenOptions={{
    headerShown: false,
    tabBarActiveTintColor: colors.teal,
    tabBarInactiveTintColor: colors.muted,
    tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border, height: 72, paddingTop: 8, paddingBottom: 10 },
    tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
  }}>
    <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color }) => <AppIcon name="house.fill" size={22} tintColor={color} /> }} />
    <Tabs.Screen name="transactions" options={{ title: 'PackProofs', tabBarIcon: ({ color }) => <AppIcon name="shippingbox.fill" size={22} tintColor={color} /> }} />
    <Tabs.Screen name="capture" options={{ href: null }} />
    <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: ({ color }) => <AppIcon name="person.crop.circle.fill" size={22} tintColor={color} /> }} />
  </Tabs>;
}

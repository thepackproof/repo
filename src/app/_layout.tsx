import 'react-native-reanimated';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '@/constants/brand';
import { AuthProvider } from '@/providers/auth-provider';
import { PurchasesProvider } from '@/providers/purchases-provider';
import { OfflineEvidenceProvider } from '@/providers/offline-evidence-provider';

export default function RootLayout() {
  return <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
    <SafeAreaProvider>
      <AuthProvider>
        <PurchasesProvider>
          <OfflineEvidenceProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'slide_from_right' }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
            <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
            <Stack.Screen name="transaction/new" options={{ presentation: 'modal' }} />
            <Stack.Screen name="transaction/[id]" />
            <Stack.Screen name="transaction/invite/[id]" options={{ presentation: 'modal' }} />
            <Stack.Screen name="capture/[id]" options={{ presentation: 'fullScreenModal' }} />
            <Stack.Screen name="connect/capture" options={{ presentation: 'fullScreenModal' }} />
            <Stack.Screen name="invite" />
            <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
          </Stack>
          </OfflineEvidenceProvider>
        </PurchasesProvider>
      </AuthProvider>
    </SafeAreaProvider>
  </GestureHandlerRootView>;
}

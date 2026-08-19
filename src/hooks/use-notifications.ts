import { useEffect } from 'react';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { callFunction } from '@/lib/api';
import { toHref } from '@/lib/ux-flow';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export function useNotifications(uid?: string) {
  const router = useRouter();
  useEffect(() => {
    if (!uid || !Device.isDevice) return;
    let active = true;
    const register = async () => {
      if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('transactions', { name: 'Transaction updates', importance: Notifications.AndroidImportance.DEFAULT, vibrationPattern: [0, 180, 100, 180], lightColor: '#467C63' });
      const existing = await Notifications.getPermissionsAsync();
      if (existing.status !== 'granted' || !active) return;
      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      if (!projectId) return;
      const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      if (active) await callFunction('registerPushToken', { token });
    };
    register().catch(() => undefined);
    return () => { active = false; };
  }, [uid]);
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const transactionId = response.notification.request.content.data?.transactionId;
      if (typeof transactionId === 'string') router.push(toHref({ pathname: '/task/[id]', params: { id: transactionId } }));
    });
    return () => subscription.remove();
  }, [router]);
}

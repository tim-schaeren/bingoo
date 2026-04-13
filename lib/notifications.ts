import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const PROJECT_ID = Constants.expoConfig?.extra?.eas?.projectId as string;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  const token = (await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID })).data;
  return token;
}

export async function sendPushNotifications(
  tokens: (string | null | undefined)[],
  title: string,
  body: string,
): Promise<void> {
  const valid = tokens.filter((t): t is string => !!t && t.startsWith('ExponentPushToken'));
  if (valid.length === 0) return;

  await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(valid.map(to => ({ to, title, body, sound: 'default' }))),
  }).catch(() => {}); // best-effort — never block the game on a failed notification
}

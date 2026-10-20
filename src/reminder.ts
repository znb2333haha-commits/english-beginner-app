import { Capacitor } from '@capacitor/core';

/** 每日提醒:只在安装的 App 里可用(网页版没有本地通知) */
export function reminderSupported(): boolean {
  return Capacitor.isNativePlatform();
}

const ID = 1001;

export async function enableReminder(hour: number, minute: number): Promise<'ok' | 'denied' | 'unsupported'> {
  if (!reminderSupported()) return 'unsupported';
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const perm = await LocalNotifications.requestPermissions();
  if (perm.display !== 'granted') return 'denied';
  await LocalNotifications.cancel({ notifications: [{ id: ID }] });
  await LocalNotifications.schedule({
    notifications: [
      {
        id: ID,
        title: '拾语',
        body: '来学 10 分钟英语吧',
        schedule: { on: { hour, minute } },
      },
    ],
  });
  return 'ok';
}

export async function disableReminder(): Promise<void> {
  if (!reminderSupported()) return;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  await LocalNotifications.cancel({ notifications: [{ id: ID }] });
}

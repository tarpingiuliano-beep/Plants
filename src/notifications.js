import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { buildSchedule } from './logic.js';

const CHANNEL = 'riego';

export const isNative = () => Capacitor.isNativePlatform();

export async function permissionState() {
  if (!isNative()) return 'unsupported';
  try {
    const r = await LocalNotifications.checkPermissions();
    return r.display; // 'granted' | 'denied' | 'prompt' | ...
  } catch {
    return 'unsupported';
  }
}

export async function askPermission() {
  if (!isNative()) return 'unsupported';
  try {
    const r = await LocalNotifications.requestPermissions();
    return r.display;
  } catch {
    return 'unsupported';
  }
}

export async function setupChannel() {
  if (!isNative()) return;
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL,
      name: 'Recordatorios de riego',
      description: 'Avisos para regar tus plantas',
      importance: 4,
      visibility: 1,
      vibration: true,
    });
  } catch {
    /* el canal ya existe o no aplica */
  }
}

/**
 * Cancela todo lo programado y vuelve a programar según el estado actual.
 * Es barato y evita que queden avisos viejos.
 */
export async function reschedule(plants, settings) {
  if (!isNative()) return { count: 0 };
  try {
    const perm = await LocalNotifications.checkPermissions();
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) {
      await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    }
    if (perm.display !== 'granted') return { count: 0, denied: true };

    const items = buildSchedule(plants, settings);
    if (!items.length) return { count: 0 };
    await LocalNotifications.schedule({
      notifications: items.map((i) => ({
        id: i.id,
        title: i.title,
        body: i.body,
        channelId: CHANNEL,
        schedule: { at: i.at, allowWhileIdle: true },
        extra: { plantId: i.plantId },
      })),
    });
    return { count: items.length };
  } catch (e) {
    console.error('reschedule', e);
    return { count: 0, error: String(e) };
  }
}

export function onNotificationTap(handler) {
  if (!isNative()) return;
  LocalNotifications.addListener('localNotificationActionPerformed', (ev) => {
    const id = ev.notification?.extra?.plantId;
    if (id) handler(id);
  });
}

/** Notificación de prueba en 5 segundos */
export async function sendTest() {
  if (!isNative()) return false;
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: 999999,
          title: '🌿 Funciona',
          body: 'Así te voy a avisar cuando toque regar.',
          channelId: CHANNEL,
          schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true },
        },
      ],
    });
    return true;
  } catch {
    return false;
  }
}

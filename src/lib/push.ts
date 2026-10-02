import { supabaseBrowser } from './supabase/client';

/**
 * Estado de los avisos en este dispositivo:
 * - unsupported: el navegador no tiene notificaciones push.
 * - needs-install: iPhone sin la app instalada (Apple solo las permite instalada).
 * - denied: la persona las bloqueó; se reactivan desde los ajustes del celular.
 * - off / on.
 */
export type PushState = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on';

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

/** El service worker solo se registra en producción: en desarrollo no hay avisos. */
const registration = async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) throw new Error('Los avisos funcionan en la app publicada, no en la versión de prueba.');
  return reg;
};

export async function pushState(): Promise<PushState> {
  if (typeof window === 'undefined') return 'unsupported';
  if (isIos() && !isInstalled()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ? 'on' : 'off';
}

const keyBytes = (base64: string) => {
  const raw = atob((base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
};

/** Pide permiso, suscribe este dispositivo y lo guarda para la cuenta. Tiene que llamarse desde un toque. */
export async function enablePush(): Promise<PushState> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) throw new Error('Faltan configurar los avisos en el servidor.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const reg = await registration();
  const subscription = (await reg.pushManager.getSubscription())
    ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  const json = subscription.toJSON();
  const { error } = await supabaseBrowser().rpc('save_push_subscription', {
    p_endpoint: subscription.endpoint, p_p256dh: json.keys?.p256dh, p_auth: json.keys?.auth, p_user_agent: navigator.userAgent
  });
  if (error) { await subscription.unsubscribe(); throw new Error('No se pudieron activar los avisos. Probá de nuevo.'); }
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  const reg = await registration();
  const subscription = await reg.pushManager.getSubscription();
  if (subscription) {
    await supabaseBrowser().from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
    await subscription.unsubscribe();
  }
  return 'off';
}

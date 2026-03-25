const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type AuthUser = {
  username: string;
  isAdmin: boolean;
};

let serviceWorkerRegistrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; ++index) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

export function registerPushServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return Promise.resolve(null);
  }

  if (!serviceWorkerRegistrationPromise) {
    const serviceWorkerUrl = `${BASE}/sw.js`;
    serviceWorkerRegistrationPromise = navigator.serviceWorker.register(serviceWorkerUrl).catch(() => null);
  }

  return serviceWorkerRegistrationPromise;
}

async function getPushPublicKey() {
  const response = await fetch(`${BASE}/api/notifications/public-key`);
  if (!response.ok) {
    throw new Error("Failed to load push public key");
  }
  const data = await response.json();
  return data.publicKey as string;
}

export async function ensurePushSubscription(user: AuthUser) {
  if (
    typeof window === "undefined" ||
    !window.isSecureContext ||
    !("Notification" in window) ||
    !("serviceWorker" in navigator)
  ) {
    return;
  }

  const registration = await registerPushServiceWorker();
  if (!registration) return;

  if (Notification.permission === "default") {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;
  }

  if (Notification.permission !== "granted") return;

  const existingSubscription = await registration.pushManager.getSubscription();
  const publicKey = await getPushPublicKey();
  const subscription =
    existingSubscription ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));

  await fetch(`${BASE}/api/notifications/subscriptions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription,
      username: user.username,
      isAdmin: user.isAdmin,
      userAgent: navigator.userAgent,
    }),
  });
}

export async function unregisterPushSubscription() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  const registration = await navigator.serviceWorker.ready.catch(() => null);
  if (!registration) return;

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  await fetch(`${BASE}/api/notifications/subscriptions/unregister`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => undefined);

  await subscription.unsubscribe().catch(() => undefined);
}

export async function markInvoicePrinted(invoiceId: number, username?: string) {
  await fetch(`${BASE}/api/notifications/invoices/${invoiceId}/printed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  }).catch(() => undefined);
}

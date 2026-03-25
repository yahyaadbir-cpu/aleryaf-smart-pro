import { apiFetch, BASE } from "@/lib/http";

type AuthUser = {
  username: string;
  isAdmin: boolean;
};

export type PushStatus = "unsupported" | "disabled" | "enabled";
export type PushPromptState = "enabled" | "can-enable" | "needs-home-screen" | "unsupported";

let serviceWorkerRegistrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

function isAppleMobileBrowser() {
  if (typeof window === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(window.navigator.userAgent || "");
}

function isStandaloneDisplayMode() {
  if (typeof window === "undefined") return false;

  const standaloneMedia = window.matchMedia?.("(display-mode: standalone)")?.matches;
  const standaloneNavigator = "standalone" in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  return Boolean(standaloneMedia || standaloneNavigator);
}

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

export async function getPushStatus(): Promise<PushStatus> {
  if (
    typeof window === "undefined" ||
    !window.isSecureContext ||
    !("Notification" in window) ||
    !("serviceWorker" in navigator)
  ) {
    return "unsupported";
  }

  if (Notification.permission === "denied") {
    return "disabled";
  }

  const registration = await registerPushServiceWorker();
  if (!registration) return "disabled";

  const subscription = await registration.pushManager.getSubscription();
  if (subscription) return "enabled";

  return Notification.permission === "granted" ? "disabled" : "disabled";
}

export async function getPushPromptState(): Promise<PushPromptState> {
  if (
    typeof window === "undefined" ||
    !window.isSecureContext ||
    !("Notification" in window) ||
    !("serviceWorker" in navigator)
  ) {
    return "unsupported";
  }

  if (isAppleMobileBrowser() && !isStandaloneDisplayMode()) {
    return "needs-home-screen";
  }

  const status = await getPushStatus();
  return status === "enabled" ? "enabled" : "can-enable";
}

export async function syncExistingPushSubscription(user: AuthUser) {
  if (
    typeof window === "undefined" ||
    !window.isSecureContext ||
    !("Notification" in window) ||
    !("serviceWorker" in navigator) ||
    Notification.permission !== "granted"
  ) {
    return false;
  }

  const registration = await registerPushServiceWorker();
  if (!registration) return false;

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return false;

  const response = await apiFetch("/api/notifications/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription,
      username: user.username,
      isAdmin: user.isAdmin,
      userAgent: navigator.userAgent,
    }),
  });

  return response.ok;
}

async function getPushPublicKey() {
  const response = await apiFetch("/api/notifications/public-key");
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
    throw new Error("unsupported");
  }

  const registration = await registerPushServiceWorker();
  if (!registration) {
    throw new Error("service-worker-registration-failed");
  }

  if (Notification.permission === "default") {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      throw new Error(permission === "denied" ? "permission-denied" : "permission-dismissed");
    }
  }

  if (Notification.permission !== "granted") {
    throw new Error("permission-not-granted");
  }

  const existingSubscription = await registration.pushManager.getSubscription();
  const publicKey = await getPushPublicKey();
  const subscription =
    existingSubscription ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));

  const response = await apiFetch("/api/notifications/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription,
      username: user.username,
      isAdmin: user.isAdmin,
      userAgent: navigator.userAgent,
    }),
  });

  if (!response.ok) {
    throw new Error("subscription-save-failed");
  }

  return subscription;
}

export async function unregisterPushSubscription() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  const registration = await navigator.serviceWorker.ready.catch(() => null);
  if (!registration) return;

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  await apiFetch("/api/notifications/subscriptions/unregister", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => undefined);

  await subscription.unsubscribe().catch(() => undefined);
}

export async function markInvoicePrinted(invoiceId: number, username?: string) {
  await apiFetch(`/api/notifications/invoices/${invoiceId}/printed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  }).catch(() => undefined);
}

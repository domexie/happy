import { Platform } from 'react-native';

/**
 * Web Notifications service for PWA push notifications.
 * Uses the Web Notifications API to show local notifications when:
 * 1. A session requires permission approval
 * 2. A session transitions from thinking to waiting (Claude finished working)
 *
 * This works without a Service Worker - notifications are triggered directly
 * from socket updates while the page is open (even in background).
 */

export type NotificationPermissionStatus = 'granted' | 'denied' | 'default' | 'unsupported';

/**
 * Check if Web Notifications are supported in the current environment
 */
export function isNotificationSupported(): boolean {
    if (Platform.OS !== 'web') return false;
    if (typeof window === 'undefined') return false;
    return 'Notification' in window;
}

/**
 * Get current notification permission status
 */
export function getNotificationPermission(): NotificationPermissionStatus {
    if (!isNotificationSupported()) return 'unsupported';
    return Notification.permission as NotificationPermissionStatus;
}

/**
 * Request notification permission from the user
 * @returns The permission status after the request
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionStatus> {
    if (!isNotificationSupported()) return 'unsupported';

    // Already granted
    if (Notification.permission === 'granted') return 'granted';

    // Already denied - can't re-request
    if (Notification.permission === 'denied') return 'denied';

    // Request permission
    const result = await Notification.requestPermission();
    return result as NotificationPermissionStatus;
}

export interface WebNotificationOptions {
    title: string;
    body: string;
    tag?: string; // Used for notification deduplication
    icon?: string;
    onClick?: () => void;
}

/**
 * Show a web notification
 * @returns true if notification was shown, false otherwise
 */
export function showNotification(options: WebNotificationOptions): boolean {
    if (!isNotificationSupported()) return false;
    if (Notification.permission !== 'granted') return false;

    // Don't show notification if document is visible and focused
    if (typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus()) {
        return false;
    }

    try {
        const notification = new Notification(options.title, {
            body: options.body,
            tag: options.tag,
            icon: options.icon || '/favicon.ico',
            requireInteraction: false,
        });

        // Clean up event handlers when notification closes
        notification.onclose = () => {
            notification.onclick = null;
            notification.onclose = null;
        };

        if (options.onClick) {
            notification.onclick = () => {
                // Focus the window
                window.focus();
                options.onClick!();
                notification.close();
            };
        }

        return true;
    } catch (e) {
        console.warn('Failed to create notification:', e);
        return false;
    }
}

import React from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { storage } from '@/sync/storage';
import { Session } from '@/sync/storageTypes';
import {
    isNotificationSupported,
    getNotificationPermission,
    requestNotificationPermission,
    showNotification,
} from '@/notifications/webNotifications';
import { useInAppNotification } from '@/notifications/InAppNotificationContext';
import { getSessionName } from '@/utils/sessionUtils';
import { t } from '@/text';

interface SessionNotificationState {
    hasPermissionRequest: boolean;
    isWaiting: boolean; // online and not thinking
}

/**
 * Component that monitors all sessions and triggers notifications when:
 * 1. A session has pending permission requests
 * 2. A session transitions from thinking to waiting (Claude finished)
 *
 * Notification behavior:
 * - Page in background: Uses Web Notifications API (system notification)
 * - Page in foreground: Uses in-app toast notification
 *
 * This component renders nothing - it only handles notification logic.
 * Only active on web platform.
 */
export const WebNotificationHandler = React.memo(() => {
    // Early return for non-web platforms to avoid unnecessary subscriptions
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
        return null;
    }

    return <WebNotificationHandlerImpl />;
});

WebNotificationHandler.displayName = 'WebNotificationHandler';

/**
 * Internal implementation component - only rendered on web platform
 */
const WebNotificationHandlerImpl = React.memo(() => {
    const router = useRouter();
    const { notify: notifyInApp } = useInAppNotification();

    // Track previous session states to detect transitions
    const previousStatesRef = React.useRef<Map<string, SessionNotificationState>>(new Map());
    // Track which permission requests we've already notified about
    const notifiedPermissionRequestsRef = React.useRef<Set<string>>(new Set());
    // Track if we've requested notification permission
    const hasRequestedPermissionRef = React.useRef(false);

    // Subscribe to all sessions
    const sessions = storage((state) => state.sessions);

    // Cleanup refs on unmount
    React.useEffect(() => {
        return () => {
            previousStatesRef.current.clear();
            notifiedPermissionRequestsRef.current.clear();
        };
    }, []);

    React.useEffect(() => {
        const previousStates = previousStatesRef.current;
        const notifiedRequests = notifiedPermissionRequestsRef.current;
        const currentSessionIds = new Set(Object.keys(sessions));

        // Clean up previousStates for sessions that no longer exist
        for (const sessionId of previousStates.keys()) {
            if (!currentSessionIds.has(sessionId)) {
                previousStates.delete(sessionId);
            }
        }

        // Process each session
        Object.values(sessions).forEach((session: Session) => {
            const isOnline = session.presence === 'online';
            if (!isOnline) {
                // Clean up state for offline sessions
                previousStates.delete(session.id);
                return;
            }

            const requests = session.agentState?.requests || {};
            const requestIds = Object.keys(requests);
            const hasPermissionRequest = requestIds.length > 0;
            const isThinking = session.thinking === true;
            const isWaiting = isOnline && !isThinking && !hasPermissionRequest;

            const previousState = previousStates.get(session.id);
            const currentState: SessionNotificationState = {
                hasPermissionRequest,
                isWaiting,
            };

            // Check for new permission requests
            if (hasPermissionRequest) {
                // Find request IDs we haven't notified about yet
                const newRequestIds = requestIds.filter(id => !notifiedRequests.has(`${session.id}:${id}`));

                if (newRequestIds.length > 0) {
                    // Get the first new request for the notification
                    const firstNewRequestId = newRequestIds[0];
                    const firstRequest = requests[firstNewRequestId];
                    const toolName = firstRequest?.tool || 'action';
                    const sessionName = getSessionName(session);

                    // Try to show web notification (only works when page is in background)
                    const webNotificationShown = tryShowWebNotification({
                        title: t('webNotifications.permissionRequired'),
                        body: t('webNotifications.permissionBody', { sessionName, toolName }),
                        tag: `permission-${session.id}`,
                        sessionId: session.id,
                        router,
                        hasRequestedPermissionRef,
                    });

                    // If web notification wasn't shown (page is in foreground), show in-app toast
                    if (!webNotificationShown) {
                        notifyInApp({
                            type: 'permission_required',
                            sessionId: session.id,
                            sessionName,
                            toolName,
                        });
                    }

                    // Always mark as notified to prevent duplicate notifications
                    newRequestIds.forEach(id => {
                        notifiedRequests.add(`${session.id}:${id}`);
                    });
                }
            }

            // Check for thinking -> waiting transition
            if (previousState && !previousState.isWaiting && currentState.isWaiting) {
                const sessionName = getSessionName(session);

                // Try to show web notification (only works when page is in background)
                const webNotificationShown = tryShowWebNotification({
                    title: t('webNotifications.sessionReady'),
                    body: t('webNotifications.sessionReadyBody', { sessionName }),
                    tag: `ready-${session.id}`,
                    sessionId: session.id,
                    router,
                    hasRequestedPermissionRef,
                });

                // If web notification wasn't shown (page is in foreground), show in-app toast
                if (!webNotificationShown) {
                    notifyInApp({
                        type: 'session_ready',
                        sessionId: session.id,
                        sessionName,
                    });
                }
            }

            // Update previous state
            previousStates.set(session.id, currentState);
        });

        // Clean up notified requests for sessions that no longer have those requests
        for (const key of notifiedRequests) {
            // Use indexOf to safely split on first colon (in case requestId contains colons)
            const colonIndex = key.indexOf(':');
            if (colonIndex === -1) continue;
            const sessionId = key.substring(0, colonIndex);
            const requestId = key.substring(colonIndex + 1);
            const session = sessions[sessionId];
            if (!session || !session.agentState?.requests?.[requestId]) {
                notifiedRequests.delete(key);
            }
        }

    }, [sessions, notifyInApp]);

    return null;
});

WebNotificationHandlerImpl.displayName = 'WebNotificationHandlerImpl';

/**
 * Try to show a web notification. Returns true if shown, false if not (e.g., page is in foreground)
 */
function tryShowWebNotification(options: {
    title: string;
    body: string;
    tag: string;
    sessionId: string;
    router: ReturnType<typeof useRouter>;
    hasRequestedPermissionRef: React.MutableRefObject<boolean>;
}): boolean {
    if (!isNotificationSupported()) return false;

    // Request notification permission if needed (only once)
    void maybeRequestPermission(options.hasRequestedPermissionRef);

    return showNotification({
        title: options.title,
        body: options.body,
        tag: options.tag,
        onClick: () => {
            options.router.push(`/session/${options.sessionId}`);
        },
    });
}

/**
 * Request notification permission if we haven't already and it's in default state
 */
async function maybeRequestPermission(hasRequestedRef: React.MutableRefObject<boolean>): Promise<void> {
    if (hasRequestedRef.current) return;

    const permission = getNotificationPermission();
    if (permission === 'default') {
        hasRequestedRef.current = true;
        await requestNotificationPermission();
    }
}

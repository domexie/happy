import React from 'react';
import { Session } from '@/sync/storageTypes';

export type InAppNotificationType = 'permission_required' | 'session_ready';

export interface InAppNotification {
    id: string;
    type: InAppNotificationType;
    sessionId: string;
    sessionName: string;
    toolName?: string; // For permission_required type
    timestamp: number;
}

interface InAppNotificationContextType {
    /** Current notification to display (null if none) */
    currentNotification: InAppNotification | null;
    /** Trigger a new in-app notification */
    notify: (notification: Omit<InAppNotification, 'id' | 'timestamp'>) => void;
    /** Dismiss the current notification */
    dismiss: () => void;
    /** Register a callback for tablet mode (scroll to session) */
    onTabletNotification: (callback: (sessionId: string) => void) => () => void;
}

const InAppNotificationContext = React.createContext<InAppNotificationContextType | null>(null);

const NOTIFICATION_DURATION = 8000; // 8 seconds

export const InAppNotificationProvider = React.memo(({ children }: { children: React.ReactNode }) => {
    const [currentNotification, setCurrentNotification] = React.useState<InAppNotification | null>(null);
    const tabletCallbacksRef = React.useRef<Set<(sessionId: string) => void>>(new Set());
    const dismissTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

    const dismiss = React.useCallback(() => {
        setCurrentNotification(null);
        if (dismissTimeoutRef.current) {
            clearTimeout(dismissTimeoutRef.current);
            dismissTimeoutRef.current = null;
        }
    }, []);

    const notify = React.useCallback((notification: Omit<InAppNotification, 'id' | 'timestamp'>) => {
        // Clear any existing timeout
        if (dismissTimeoutRef.current) {
            clearTimeout(dismissTimeoutRef.current);
        }

        const newNotification: InAppNotification = {
            ...notification,
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
        };

        setCurrentNotification(newNotification);

        // Notify tablet callbacks (for scroll-to-session)
        tabletCallbacksRef.current.forEach(callback => {
            callback(notification.sessionId);
        });

        // Auto-dismiss after duration
        dismissTimeoutRef.current = setTimeout(() => {
            setCurrentNotification(prev => {
                // Only dismiss if it's the same notification
                if (prev?.id === newNotification.id) {
                    return null;
                }
                return prev;
            });
        }, NOTIFICATION_DURATION);
    }, []);

    const onTabletNotification = React.useCallback((callback: (sessionId: string) => void) => {
        tabletCallbacksRef.current.add(callback);
        return () => {
            tabletCallbacksRef.current.delete(callback);
        };
    }, []);

    // Cleanup on unmount
    React.useEffect(() => {
        return () => {
            if (dismissTimeoutRef.current) {
                clearTimeout(dismissTimeoutRef.current);
            }
        };
    }, []);

    const contextValue = React.useMemo(() => ({
        currentNotification,
        notify,
        dismiss,
        onTabletNotification,
    }), [currentNotification, notify, dismiss, onTabletNotification]);

    return (
        <InAppNotificationContext.Provider value={contextValue}>
            {children}
        </InAppNotificationContext.Provider>
    );
});

InAppNotificationProvider.displayName = 'InAppNotificationProvider';

export function useInAppNotification() {
    const context = React.useContext(InAppNotificationContext);
    if (!context) {
        throw new Error('useInAppNotification must be used within InAppNotificationProvider');
    }
    return context;
}

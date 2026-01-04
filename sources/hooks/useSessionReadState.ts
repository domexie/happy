import * as React from 'react';
import { storage } from '@/sync/storage';
import { Session } from '@/sync/storageTypes';

/**
 * Hook to check if a session has unread messages and mark it as read.
 *
 * A session is considered "unread" when:
 * - The session's current seq is greater than the last recorded read seq
 * - OR if no read state has been recorded for this session (first view)
 *
 * Returns:
 * - hasUnread: boolean indicating if there are unread messages
 * - markAsRead: function to mark the session as read (updates lastReadSeq to session.seq)
 */
export function useSessionReadState(session: Session) {
    const hasUnread = React.useMemo(() => {
        const readSeq = session.lastReadSeq;
        // Session is unread if we have no record OR if session.seq is higher
        return readSeq === undefined || readSeq === null || session.seq > readSeq;
    }, [session.lastReadSeq, session.seq]);

    const markAsRead = React.useCallback(() => {
        const currentReadSeq = session.lastReadSeq;
        // Only update if needed (prevents unnecessary re-renders)
        if (currentReadSeq === undefined || currentReadSeq === null || session.seq > currentReadSeq) {
            storage.getState().updateSessionLastReadSeq(session.id, session.seq);
        }
    }, [session.id, session.seq, session.lastReadSeq]);

    return { hasUnread, markAsRead };
}

/**
 * Simple hook to just check if a session has unread messages.
 * Use this for display purposes where you don't need to mark as read.
 */
export function useSessionHasUnread(session: Session): boolean {
    return React.useMemo(() => {
        const readSeq = session.lastReadSeq;
        return readSeq === undefined || readSeq === null || session.seq > readSeq;
    }, [session.lastReadSeq, session.seq]);
}

import * as React from 'react';

interface VoiceAssistantStatusBarProps {
    variant?: 'full' | 'sidebar';
    style?: any;
}

// Voice assistant feature has been removed
// This component now returns null but is kept for backward compatibility
export const VoiceAssistantStatusBar = React.memo(({ variant = 'full', style }: VoiceAssistantStatusBarProps) => {
    return null;
});
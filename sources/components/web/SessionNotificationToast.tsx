import React from 'react';
import { View, Text, Pressable, Animated, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useInAppNotification } from '@/notifications/InAppNotificationContext';
import { useIsTablet } from '@/utils/responsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Typography } from '@/constants/Typography';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';

const TOAST_WIDTH_TABLET = 360;

/**
 * Toast component that displays in-app notifications when the page is in foreground.
 * - On mobile: Full-width toast at the bottom of the screen
 * - On tablet: Fixed-width toast at the bottom-right corner
 *
 * This complements the Web Notifications API which only shows when page is in background.
 */
export const SessionNotificationToast = React.memo(() => {
    const isTablet = useIsTablet();
    const { currentNotification, dismiss } = useInAppNotification();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { theme } = useUnistyles();

    // Animation value for slide-in effect
    const translateY = React.useRef(new Animated.Value(100)).current;
    const opacity = React.useRef(new Animated.Value(0)).current;

    // Animate in/out when notification changes
    React.useEffect(() => {
        if (currentNotification) {
            // Animate in
            Animated.parallel([
                Animated.spring(translateY, {
                    toValue: 0,
                    useNativeDriver: true,
                    tension: 100,
                    friction: 10,
                }),
                Animated.timing(opacity, {
                    toValue: 1,
                    duration: 200,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            // Animate out
            Animated.parallel([
                Animated.timing(translateY, {
                    toValue: 100,
                    duration: 200,
                    useNativeDriver: true,
                }),
                Animated.timing(opacity, {
                    toValue: 0,
                    duration: 200,
                    useNativeDriver: true,
                }),
            ]).start();
        }
    }, [currentNotification, translateY, opacity]);

    if (!currentNotification) {
        return null;
    }

    const handlePress = () => {
        router.push(`/session/${currentNotification.sessionId}`);
        dismiss();
    };

    const getIcon = () => {
        switch (currentNotification.type) {
            case 'permission_required':
                return <Ionicons name="shield-checkmark" size={24} color={theme.colors.warning} />;
            case 'session_ready':
                return <Ionicons name="checkmark-circle" size={24} color={theme.colors.success} />;
            default:
                return <Ionicons name="notifications" size={24} color={theme.colors.textSecondary} />;
        }
    };

    const getTitle = () => {
        switch (currentNotification.type) {
            case 'permission_required':
                return t('webNotifications.permissionRequired');
            case 'session_ready':
                return t('webNotifications.sessionReady');
            default:
                return '';
        }
    };

    const getBody = () => {
        switch (currentNotification.type) {
            case 'permission_required':
                return t('webNotifications.permissionBody', {
                    sessionName: currentNotification.sessionName,
                    toolName: currentNotification.toolName || 'action',
                });
            case 'session_ready':
                return t('webNotifications.sessionReadyBody', {
                    sessionName: currentNotification.sessionName,
                });
            default:
                return '';
        }
    };

    // Position styles based on layout
    const containerPositionStyle = isTablet
        ? {
            // Tablet: fixed width, bottom-right corner
            right: 16,
            width: TOAST_WIDTH_TABLET,
            bottom: insets.bottom + 16,
        }
        : {
            // Mobile: full width with margins
            left: 16,
            right: 16,
            bottom: insets.bottom + 16,
        };

    return (
        <Animated.View
            style={[
                styles.container,
                containerPositionStyle,
                {
                    transform: [{ translateY }],
                    opacity,
                    backgroundColor: theme.colors.surface,
                    shadowColor: theme.colors.text,
                },
            ]}
            pointerEvents="box-none"
        >
            <Pressable
                style={styles.toast}
                onPress={handlePress}
            >
                <View style={styles.iconContainer}>
                    {getIcon()}
                </View>
                <View style={styles.content}>
                    <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>
                        {getTitle()}
                    </Text>
                    <Text style={[styles.body, { color: theme.colors.textSecondary }]} numberOfLines={2}>
                        {getBody()}
                    </Text>
                </View>
                <Pressable
                    style={styles.dismissButton}
                    onPress={(e) => {
                        e.stopPropagation();
                        dismiss();
                    }}
                    hitSlop={8}
                >
                    <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
                </Pressable>
            </Pressable>
        </Animated.View>
    );
});

SessionNotificationToast.displayName = 'SessionNotificationToast';

const styles = StyleSheet.create((theme) => ({
    container: {
        position: 'absolute',
        borderRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 8,
        zIndex: 1000,
    },
    toast: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
    iconContainer: {
        marginRight: 12,
    },
    content: {
        flex: 1,
    },
    title: {
        fontSize: 15,
        fontWeight: '600',
        ...Typography.default('semiBold'),
    },
    body: {
        fontSize: 13,
        marginTop: 2,
        ...Typography.default(),
    },
    dismissButton: {
        marginLeft: 8,
        padding: 4,
    },
}));

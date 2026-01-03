import { useAuth } from '@/auth/AuthContext';
import * as React from 'react';
import { Drawer } from 'expo-router/drawer';
import { useIsTablet } from '@/utils/responsive';
import { SidebarView } from './SidebarView';
import { View, useWindowDimensions, Platform } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { useSidebar, SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX } from './SidebarContext';

// Animation config with ease-out curve
const ANIMATION_DURATION = 250;
const ANIMATION_CONFIG = {
    duration: ANIMATION_DURATION,
    easing: Easing.out(Easing.cubic),
};

/**
 * Animated wrapper for sidebar that smoothly transitions width.
 * Uses CSS transition on web for better performance.
 */
const AnimatedSidebarWrapper = React.memo(({ children, targetWidth }: { children: React.ReactNode; targetWidth: number }) => {
    // Use CSS transition on web for smooth animation
    if (Platform.OS === 'web') {
        return (
            <View
                style={{
                    width: targetWidth,
                    flex: 1,
                    overflow: 'hidden',
                    // @ts-ignore - web-only CSS property
                    transition: `width ${ANIMATION_DURATION}ms cubic-bezier(0.33, 1, 0.68, 1)`,
                }}
            >
                {children}
            </View>
        );
    }

    // Use reanimated on native
    const animatedWidth = useSharedValue(targetWidth);

    React.useEffect(() => {
        animatedWidth.value = withTiming(targetWidth, ANIMATION_CONFIG);
    }, [targetWidth]);

    const animatedStyle = useAnimatedStyle(() => ({
        width: animatedWidth.value,
        overflow: 'hidden' as const,
    }));

    return (
        <Animated.View style={[{ flex: 1 }, animatedStyle]}>
            {children}
        </Animated.View>
    );
});

export const SidebarNavigator = React.memo(() => {
    const auth = useAuth();
    const isTablet = useIsTablet();
    const showPermanentDrawer = auth.isAuthenticated && isTablet;
    const { width: windowWidth } = useWindowDimensions();
    const { isCollapsed } = useSidebar();

    // Calculate target width for animation
    const expandedWidth = Math.min(Math.max(Math.floor(windowWidth * 0.3), SIDEBAR_WIDTH_MIN), SIDEBAR_WIDTH_MAX);
    const targetWidth = isCollapsed ? SIDEBAR_WIDTH_COLLAPSED : expandedWidth;

    const drawerNavigationOptions = React.useMemo(() => {
        if (!showPermanentDrawer) {
            // When drawer is hidden, use minimal configuration
            return {
                lazy: false,
                headerShown: false,
                drawerType: 'front' as const,
                swipeEnabled: false,
                drawerStyle: {
                    width: 0,
                    display: 'none' as const,
                },
            };
        }

        // When drawer is permanent - use CSS transition on web for smooth animation
        const baseDrawerStyle = {
            backgroundColor: 'transparent',
            borderRightWidth: 0,
            width: targetWidth,
            overflow: 'hidden' as const,
        };

        // Add CSS transition for web
        const drawerStyle = Platform.OS === 'web'
            ? {
                ...baseDrawerStyle,
                // @ts-ignore - web-only CSS property
                transition: `width ${ANIMATION_DURATION}ms cubic-bezier(0.33, 1, 0.68, 1)`,
            }
            : baseDrawerStyle;

        return {
            lazy: false,
            headerShown: false,
            drawerType: 'permanent' as const,
            drawerStyle,
            swipeEnabled: false,
            drawerActiveTintColor: 'transparent',
            drawerInactiveTintColor: 'transparent',
            drawerItemStyle: { display: 'none' as const },
            drawerLabelStyle: { display: 'none' as const },
        };
    }, [showPermanentDrawer, targetWidth]);

    // Wrap SidebarView with animated container for native platforms
    const drawerContent = React.useCallback(
        () => (
            <AnimatedSidebarWrapper targetWidth={targetWidth}>
                <SidebarView />
            </AnimatedSidebarWrapper>
        ),
        [targetWidth]
    );

    return (
        <Drawer
            screenOptions={drawerNavigationOptions}
            drawerContent={showPermanentDrawer ? drawerContent : undefined}
        />
    )
});
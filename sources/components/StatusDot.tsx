import * as React from 'react';
import { ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming } from 'react-native-reanimated';

export interface StatusDotProps {
    color: string;
    isPulsing?: boolean;
    size?: number;
    style?: ViewStyle;
    /** Base opacity for the dot (default: 1). Pulsing animation will animate from this value to 0.3 */
    baseOpacity?: number;
}

export const StatusDot = React.memo(({ color, isPulsing, size = 6, style, baseOpacity = 1 }: StatusDotProps) => {
    const opacity = useSharedValue(baseOpacity);

    React.useEffect(() => {
        if (isPulsing) {
            // Reset to full opacity before starting pulse animation
            opacity.value = 1;
            opacity.value = withRepeat(
                withTiming(0.3, { duration: 1000 }),
                -1, // infinite
                true // reverse
            );
        } else {
            opacity.value = withTiming(baseOpacity, { duration: 200 });
        }
    }, [isPulsing, baseOpacity]);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            opacity: opacity.value,
        };
    });

    const baseStyle: ViewStyle = {
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
    };

    return (
        <Animated.View
            style={[
                baseStyle,
                animatedStyle,
                style
            ]}
        />
    );
});
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { View, Text, Pressable, Platform, StyleSheet as RNStyleSheet } from 'react-native';
import { Typography } from '@/constants/Typography';
import { useUnistyles } from 'react-native-unistyles';

// Context menu item definition
export interface ContextMenuItem {
    label: string;
    onSelect: () => void;
    style?: 'default' | 'destructive';
}

// Context menu state
interface ContextMenuState {
    visible: boolean;
    x: number;
    y: number;
    items: ContextMenuItem[];
}

// Context menu context
interface ContextMenuContextValue {
    show: (x: number, y: number, items: ContextMenuItem[]) => void;
    hide: () => void;
}

const ContextMenuContext = createContext<ContextMenuContextValue | null>(null);

// Hook to use context menu
export function useContextMenu() {
    const context = useContext(ContextMenuContext);
    if (!context) {
        throw new Error('useContextMenu must be used within ContextMenuProvider');
    }
    return context;
}

// Helper function to show context menu from a mouse event (web only)
export function showContextMenuFromEvent(
    e: any,
    items: ContextMenuItem[],
    show: (x: number, y: number, items: ContextMenuItem[]) => void
) {
    if (Platform.OS !== 'web') return;

    e.preventDefault?.();
    e.stopPropagation?.();

    const nativeEvent = e.nativeEvent || e;
    const x = nativeEvent.clientX ?? nativeEvent.pageX ?? 0;
    const y = nativeEvent.clientY ?? nativeEvent.pageY ?? 0;

    show(x, y, items);
}

// Context menu provider component
export function ContextMenuProvider({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<ContextMenuState>({
        visible: false,
        x: 0,
        y: 0,
        items: [],
    });

    const show = useCallback((x: number, y: number, items: ContextMenuItem[]) => {
        setState({ visible: true, x, y, items });
    }, []);

    const hide = useCallback(() => {
        setState(prev => ({ ...prev, visible: false }));
    }, []);

    // Close on escape key
    useEffect(() => {
        if (Platform.OS !== 'web' || !state.visible) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                hide();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [state.visible, hide]);

    return (
        <ContextMenuContext.Provider value={{ show, hide }}>
            {children}
            {state.visible && Platform.OS === 'web' && (
                <ContextMenuOverlay
                    x={state.x}
                    y={state.y}
                    items={state.items}
                    onClose={hide}
                />
            )}
        </ContextMenuContext.Provider>
    );
}

// Context menu overlay component (web only)
function ContextMenuOverlay({
    x,
    y,
    items,
    onClose,
}: {
    x: number;
    y: number;
    items: ContextMenuItem[];
    onClose: () => void;
}) {
    const { theme } = useUnistyles();
    const [adjustedPosition, setAdjustedPosition] = useState({ x, y });

    // Adjust position to keep menu within viewport
    useEffect(() => {
        if (Platform.OS !== 'web') return;

        const menuWidth = 200;
        const menuHeight = items.length * 44;
        const padding = 8;

        let adjustedX = x;
        let adjustedY = y;

        // Adjust horizontal position
        if (x + menuWidth + padding > window.innerWidth) {
            adjustedX = window.innerWidth - menuWidth - padding;
        }

        // Adjust vertical position
        if (y + menuHeight + padding > window.innerHeight) {
            adjustedY = window.innerHeight - menuHeight - padding;
        }

        setAdjustedPosition({ x: adjustedX, y: adjustedY });
    }, [x, y, items.length]);

    const styles = RNStyleSheet.create({
        overlay: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
        },
        menu: {
            position: 'absolute',
            left: adjustedPosition.x,
            top: adjustedPosition.y,
            minWidth: 180,
            maxWidth: 280,
            backgroundColor: theme.colors.surface,
            borderRadius: 8,
            shadowColor: theme.colors.shadow.color,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 12,
            elevation: 8,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: theme.colors.divider,
        },
        menuItem: {
            paddingHorizontal: 12,
            paddingVertical: 10,
        },
        menuItemPressed: {
            backgroundColor: theme.colors.surfaceHighest,
        },
        menuItemText: {
            fontSize: 14,
            color: theme.colors.text,
            ...Typography.default(),
        },
        menuItemTextDestructive: {
            color: theme.colors.textDestructive,
        },
        separator: {
            height: 1,
            backgroundColor: theme.colors.divider,
        },
    });

    const handleItemPress = (item: ContextMenuItem) => {
        onClose();
        item.onSelect();
    };

    return (
        <View style={styles.overlay}>
            {/* Backdrop to close menu */}
            <Pressable
                style={RNStyleSheet.absoluteFill}
                onPress={onClose}
            />
            {/* Menu */}
            <View style={styles.menu}>
                {items.map((item, index) => (
                    <React.Fragment key={index}>
                        {index > 0 && <View style={styles.separator} />}
                        <Pressable
                            style={({ pressed }) => [
                                styles.menuItem,
                                pressed && styles.menuItemPressed,
                            ]}
                            onPress={() => handleItemPress(item)}
                        >
                            <Text
                                style={[
                                    styles.menuItemText,
                                    item.style === 'destructive' && styles.menuItemTextDestructive,
                                ]}
                            >
                                {item.label}
                            </Text>
                        </Pressable>
                    </React.Fragment>
                ))}
            </View>
        </View>
    );
}

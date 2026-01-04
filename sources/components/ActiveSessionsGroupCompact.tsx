import React from 'react';
import { View, Pressable, Platform, LayoutChangeEvent, GestureResponderEvent } from 'react-native';
import { Text } from '@/components/StyledText';
import { Session, Machine } from '@/sync/storageTypes';
import { Ionicons } from '@expo/vector-icons';
import { getSessionName, useSessionStatus, getSessionAvatarId, formatPathRelativeToHome } from '@/utils/sessionUtils';
import { Avatar } from './Avatar';
import { Typography } from '@/constants/Typography';
import { StatusDot } from './StatusDot';
import { useAllMachines, useLocalSettingMutable } from '@/sync/storage';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';
import { useNavigateToSession } from '@/hooks/useNavigateToSession';
import { useIsTablet } from '@/utils/responsive';
import { ProjectGitStatus } from './ProjectGitStatus';
import { useSessionHasUnread } from '@/hooks/useSessionReadState';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, interpolate } from 'react-native-reanimated';
import { Modal } from '@/modal';
import { machineSpawnNewSession, sessionKill } from '@/sync/ops';
import { isMachineOnline } from '@/utils/machineUtils';
import { useRouter } from 'expo-router';
import { useContextMenu, showContextMenuFromEvent, ContextMenuItem } from './ContextMenu';

const stylesheet = StyleSheet.create((theme, runtime) => ({
    container: {
        backgroundColor: theme.colors.groupped.background,
        paddingTop: 8,
    },
    projectCard: {
        backgroundColor: theme.colors.surface,
        marginBottom: 8,
        marginHorizontal: Platform.select({ ios: 16, default: 12 }),
        borderRadius: Platform.select({ ios: 10, default: 16 }),
        overflow: 'hidden',
        shadowColor: theme.colors.shadow.color,
        shadowOffset: { width: 0, height: 0.33 },
        shadowOpacity: theme.colors.shadow.opacity,
        shadowRadius: 0,
        elevation: 1,
    },
    sectionHeader: {
        paddingTop: 12,
        paddingBottom: Platform.select({ ios: 6, default: 8 }),
        paddingHorizontal: Platform.select({ ios: 32, default: 24 }),
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    sectionHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        marginRight: 8,
    },
    sectionHeaderAvatar: {
        marginRight: 8,
    },
    sectionHeaderPath: {
        ...Typography.default('regular'),
        color: theme.colors.groupped.sectionTitle,
        fontSize: Platform.select({ ios: 13, default: 14 }),
        lineHeight: Platform.select({ ios: 18, default: 20 }),
        letterSpacing: Platform.select({ ios: -0.08, default: 0.1 }),
        fontWeight: Platform.select({ ios: 'normal', default: '500' }),
        flex: 1,
    },
    chevronIcon: {
        marginRight: 4,
    },
    sessionRow: {
        height: 56,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        backgroundColor: theme.colors.surface,
    },
    sessionRowWithBorder: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.divider,
    },
    sessionRowSelected: {
        backgroundColor: theme.colors.surfaceSelected,
    },
    sessionContent: {
        flex: 1,
        justifyContent: 'center',
    },
    sessionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    sessionTitle: {
        fontSize: 15,
        flex: 1,
        ...Typography.default('regular'),
    },
    sessionTitleConnected: {
        color: theme.colors.text,
    },
    sessionTitleDisconnected: {
        color: theme.colors.textSecondary,
    },
    statusDotContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 16,
        height: 16,
    },
    newSessionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        height: 56,
        paddingHorizontal: 16,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.colors.divider,
        backgroundColor: theme.colors.surface,
    },
    newSessionButtonDisabled: {
        opacity: 0.4,
    },
    newSessionButtonContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    newSessionButtonIcon: {
        marginRight: 8,
        width: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    newSessionButtonText: {
        fontSize: 15,
        color: theme.colors.textSecondary,
        ...Typography.default('regular'),
    },
}));

interface ActiveSessionsGroupProps {
    sessions: Session[];
    selectedSessionId?: string;
}

// Animated chevron icon that rotates between collapsed (pointing right) and expanded (pointing down) states
const AnimatedChevron = React.memo(({ collapsed, color }: { collapsed: boolean; color: string }) => {
    const rotation = useSharedValue(collapsed ? 0 : 1);

    React.useEffect(() => {
        rotation.value = withTiming(collapsed ? 0 : 1, { duration: 200 });
    }, [collapsed, rotation]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${interpolate(rotation.value, [0, 1], [0, 90])}deg` }],
    }));

    return (
        <Animated.View style={[stylesheet.chevronIcon, animatedStyle]}>
            <Ionicons
                name="chevron-forward"
                size={16}
                color={color}
            />
        </Animated.View>
    );
});

// Collapsible container with height animation
// sessionCount is used to trigger re-measurement when content changes
const CollapsibleCard = React.memo(({ collapsed, sessionCount, children }: { collapsed: boolean; sessionCount: number; children: React.ReactNode }) => {
    const [contentHeight, setContentHeight] = React.useState(0);
    const animatedHeight = useSharedValue(collapsed ? 0 : 1);
    const isFirstRender = React.useRef(true);

    // Handle collapse/expand animation
    React.useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            // Set initial value without animation
            animatedHeight.value = collapsed ? 0 : 1;
            return;
        }
        // Animate to new state
        animatedHeight.value = withTiming(collapsed ? 0 : 1, { duration: 200 });
    }, [collapsed, animatedHeight]);

    // Measure content height whenever it changes
    const handleContentLayout = React.useCallback((event: LayoutChangeEvent) => {
        const height = event.nativeEvent.layout.height;
        if (height > 0 && height !== contentHeight) {
            setContentHeight(height);
        }
    }, [contentHeight]);

    const animatedStyle = useAnimatedStyle(() => {
        // No height measured yet - use auto height when expanded, 0 when collapsed
        if (contentHeight === 0) {
            if (collapsed) {
                return { height: 0, opacity: 0, overflow: 'hidden' as const };
            }
            return {};
        }
        // Animate between 0 and measured height
        const height = interpolate(animatedHeight.value, [0, 1], [0, contentHeight]);
        return {
            height,
            opacity: interpolate(animatedHeight.value, [0, 0.3, 1], [0, 1, 1]),
            overflow: 'hidden' as const,
        };
    });

    return (
        <>
            {/* Hidden container for measuring content height - measures inner content only */}
            <View
                style={{
                    position: 'absolute',
                    opacity: 0,
                    pointerEvents: 'none',
                    left: Platform.select({ ios: 16, default: 12 }),
                    right: Platform.select({ ios: 16, default: 12 }),
                }}
            >
                <View onLayout={handleContentLayout}>
                    {children}
                </View>
            </View>
            {/* Visible animated container */}
            <Animated.View style={[stylesheet.projectCard, animatedStyle]}>
                {children}
            </Animated.View>
        </>
    );
});

export function ActiveSessionsGroupCompact({ sessions, selectedSessionId }: ActiveSessionsGroupProps) {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const machines = useAllMachines();
    const router = useRouter();
    const [collapsedPaths, setCollapsedPaths] = useLocalSettingMutable('collapsedProjectPaths');
    const contextMenu = useContextMenu();

    const isCollapsed = React.useCallback((path: string) => {
        return collapsedPaths.includes(path);
    }, [collapsedPaths]);

    const toggleCollapsed = React.useCallback((path: string) => {
        if (collapsedPaths.includes(path)) {
            setCollapsedPaths(collapsedPaths.filter(p => p !== path));
        } else {
            setCollapsedPaths([...collapsedPaths, path]);
        }
    }, [collapsedPaths, setCollapsedPaths]);

    const machinesMap = React.useMemo(() => {
        const map: Record<string, Machine> = {};
        machines.forEach(machine => {
            map[machine.id] = machine;
        });
        return map;
    }, [machines]);

    // Build context menu items for project group
    const getProjectContextMenuItems = React.useCallback((
        projectPath: string,
        projectSessions: Session[],
        machine: Machine | null,
        machineId: string
    ): ContextMenuItem[] => {
        const isOnline = machine && isMachineOnline(machine);
        const activeSessions = projectSessions.filter(s => s.active);

        const items: ContextMenuItem[] = [];

        // New session action - only if machine is online
        if (isOnline) {
            items.push({
                label: t('newSession.startNewSessionInFolder'),
                onSelect: async () => {
                    const result = await machineSpawnNewSession({
                        machineId,
                        directory: projectPath,
                    });
                    if (result.type === 'success' && result.sessionId) {
                        router.push(`/session/${result.sessionId}`);
                    } else if (result.type === 'error') {
                        Modal.alert(t('common.error'), result.errorMessage || t('newSession.failedToStart'));
                    }
                }
            });
        }

        // Archive all sessions action - only if there are active sessions
        if (activeSessions.length > 0) {
            items.push({
                label: t('projectActions.archiveAllSessions'),
                style: 'destructive',
                onSelect: () => {
                    Modal.alert(
                        t('projectActions.archiveAllSessions'),
                        t('projectActions.archiveAllSessionsConfirm', { count: activeSessions.length }),
                        [
                            { text: t('common.cancel'), style: 'cancel' },
                            {
                                text: t('projectActions.archive'),
                                style: 'destructive',
                                onPress: async () => {
                                    for (const session of activeSessions) {
                                        await sessionKill(session.id);
                                    }
                                }
                            }
                        ]
                    );
                }
            });
        }

        return items;
    }, [router]);

    // Show context menu for long press - only on native platforms, web uses onContextMenu
    const handleProjectLongPress = Platform.OS !== 'web'
        ? (
            projectPath: string,
            projectSessions: Session[],
            machine: Machine | null,
            machineId: string
        ) => {
            const items = getProjectContextMenuItems(projectPath, projectSessions, machine, machineId);
            if (items.length === 0) return;

            const buttons: Array<{ text: string; style?: 'default' | 'destructive' | 'cancel'; onPress?: () => void }> = items.map(item => ({
                text: item.label,
                style: item.style,
                onPress: item.onSelect
            }));
            buttons.push({ text: t('common.cancel'), style: 'cancel' });
            Modal.alert(projectPath, undefined, buttons);
        }
        : undefined;

    // Get all current project paths from sessions
    const currentProjectPaths = React.useMemo(() => {
        const paths = new Set<string>();
        sessions.forEach(session => {
            const projectPath = session.metadata?.path || '';
            if (projectPath) {
                paths.add(projectPath);
            }
        });
        return paths;
    }, [sessions]);

    // Clean up stale collapsed paths that no longer exist
    React.useEffect(() => {
        const stalePaths = collapsedPaths.filter(path => !currentProjectPaths.has(path));
        if (stalePaths.length > 0) {
            setCollapsedPaths(collapsedPaths.filter(path => currentProjectPaths.has(path)));
        }
    }, [currentProjectPaths, collapsedPaths, setCollapsedPaths]);

    // Group sessions by project, then associate with machine
    const projectGroups = React.useMemo(() => {
        const groups = new Map<string, {
            path: string;
            displayPath: string;
            machines: Map<string, {
                machine: Machine | null;
                machineName: string;
                sessions: Session[];
            }>;
        }>();

        sessions.forEach(session => {
            const projectPath = session.metadata?.path || '';
            const unknownText = t('status.unknown');
            const machineId = session.metadata?.machineId || unknownText;

            // Get machine info
            const machine = machineId !== unknownText ? machinesMap[machineId] : null;
            const machineName = machine?.metadata?.displayName ||
                machine?.metadata?.host ||
                (machineId !== unknownText ? machineId : `<${unknownText}>`);

            // Get or create project group
            let projectGroup = groups.get(projectPath);
            if (!projectGroup) {
                const displayPath = formatPathRelativeToHome(projectPath, session.metadata?.homeDir);
                projectGroup = {
                    path: projectPath,
                    displayPath,
                    machines: new Map()
                };
                groups.set(projectPath, projectGroup);
            }

            // Get or create machine group within project
            let machineGroup = projectGroup.machines.get(machineId);
            if (!machineGroup) {
                machineGroup = {
                    machine,
                    machineName,
                    sessions: []
                };
                projectGroup.machines.set(machineId, machineGroup);
            }

            // Add session to machine group
            machineGroup.sessions.push(session);
        });

        // Sort sessions within each machine group by creation time (newest first)
        groups.forEach(projectGroup => {
            projectGroup.machines.forEach(machineGroup => {
                machineGroup.sessions.sort((a, b) => b.createdAt - a.createdAt);
            });
        });

        return groups;
    }, [sessions, machinesMap]);

    // Sort project groups by display path
    const sortedProjectGroups = React.useMemo(() => {
        return Array.from(projectGroups.entries()).sort(([, groupA], [, groupB]) => {
            return groupA.displayPath.localeCompare(groupB.displayPath);
        });
    }, [projectGroups]);

    return (
        <View style={styles.container}>
            {sortedProjectGroups.map(([projectPath, projectGroup]) => {

                // Get the avatar ID from the first session
                const firstSession = Array.from(projectGroup.machines.values())[0]?.sessions[0];
                const avatarId = firstSession ? getSessionAvatarId(firstSession) : undefined;

                const collapsed = isCollapsed(projectPath);

                // Get all sessions and first machine for context menu
                const allProjectSessions = Array.from(projectGroup.machines.values()).flatMap(mg => mg.sessions);
                const firstMachineEntry = Array.from(projectGroup.machines.entries())[0];
                const firstMachine = firstMachineEntry?.[1]?.machine ?? null;
                const firstMachineId = firstMachineEntry?.[0] ?? '';

                // Handle right-click on web - show positioned context menu
                const handleContextMenu = Platform.OS === 'web'
                    ? (e: GestureResponderEvent) => {
                        const items = getProjectContextMenuItems(projectPath, allProjectSessions, firstMachine, firstMachineId);
                        if (items.length > 0) {
                            showContextMenuFromEvent(e, items, contextMenu.show);
                        }
                    }
                    : undefined;

                return (
                    <View key={projectPath}>
                        {/* Section header on grouped background */}
                        <Pressable
                            style={styles.sectionHeader}
                            onPress={() => toggleCollapsed(projectPath)}
                            onLongPress={handleProjectLongPress ? () => handleProjectLongPress(projectPath, allProjectSessions, firstMachine, firstMachineId) : undefined}
                            delayLongPress={500}
                            // @ts-ignore - onContextMenu is available on web
                            onContextMenu={handleContextMenu}
                        >
                            <AnimatedChevron
                                collapsed={collapsed}
                                color={theme.colors.groupped.sectionTitle}
                            />
                            <View style={styles.sectionHeaderLeft}>
                                {avatarId && (
                                    <View style={styles.sectionHeaderAvatar}>
                                        <Avatar id={avatarId} size={24} flavor={firstSession?.metadata?.flavor} />
                                    </View>
                                )}
                                <Text style={styles.sectionHeaderPath}>
                                    {projectGroup.displayPath}
                                </Text>
                            </View>
                            {/* Show git status instead of machine name */}
                            {firstSession ? (
                                <ProjectGitStatus sessionId={firstSession.id} />
                            ) : null}
                        </Pressable>

                        {/* Card with just the sessions - animated collapse */}
                        <CollapsibleCard collapsed={collapsed} sessionCount={allProjectSessions.length}>
                            {/* Sessions grouped by machine within the card */}
                            {Array.from(projectGroup.machines.entries())
                                .sort(([, machineA], [, machineB]) => machineA.machineName.localeCompare(machineB.machineName))
                                .map(([machineId, machineGroup]) => (
                                    <View key={`${projectPath}-${machineId}`}>
                                        {machineGroup.sessions.map((session, index) => (
                                            <CompactSessionRow
                                                key={session.id}
                                                session={session}
                                                selected={selectedSessionId === session.id}
                                                showBorder={index < machineGroup.sessions.length - 1 ||
                                                    Array.from(projectGroup.machines.keys()).indexOf(machineId) < projectGroup.machines.size - 1}
                                            />
                                        ))}
                                    </View>
                                ))}
                        </CollapsibleCard>
                    </View>
                );
            })}
        </View>
    );
}

// Compact session row component with status line
const CompactSessionRow = React.memo(({ session, selected, showBorder }: { session: Session; selected?: boolean; showBorder?: boolean }) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const sessionStatus = useSessionStatus(session);
    const sessionName = getSessionName(session);
    const navigateToSession = useNavigateToSession();
    const isTablet = useIsTablet();
    const hasUnread = useSessionHasUnread(session);
    const contextMenu = useContextMenu();

    // Build context menu items for session
    const getSessionContextMenuItems = React.useCallback((): ContextMenuItem[] => {
        const items: ContextMenuItem[] = [];

        // Archive session action - only if session is active
        if (session.active) {
            items.push({
                label: t('sessionInfo.archiveSession'),
                style: 'destructive',
                onSelect: () => {
                    Modal.alert(
                        t('sessionInfo.archiveSession'),
                        t('sessionInfo.archiveSessionConfirm'),
                        [
                            { text: t('common.cancel'), style: 'cancel' },
                            {
                                text: t('projectActions.archive'),
                                style: 'destructive',
                                onPress: async () => {
                                    await sessionKill(session.id);
                                }
                            }
                        ]
                    );
                }
            });
        }

        return items;
    }, [session.id, session.active]);

    // Handle right-click on web
    const handleContextMenu = Platform.OS === 'web'
        ? (e: GestureResponderEvent) => {
            const items = getSessionContextMenuItems();
            if (items.length > 0) {
                showContextMenuFromEvent(e, items, contextMenu.show);
            }
        }
        : undefined;

    // Handle long press on native only - web uses onContextMenu
    const handleLongPress = Platform.OS !== 'web'
        ? () => {
            const items = getSessionContextMenuItems();
            if (items.length === 0) return;

            const buttons: Array<{ text: string; style?: 'default' | 'destructive' | 'cancel'; onPress?: () => void }> = items.map(item => ({
                text: item.label,
                style: item.style,
                onPress: item.onSelect
            }));
            buttons.push({ text: t('common.cancel'), style: 'cancel' });
            Modal.alert(sessionName, undefined, buttons);
        }
        : undefined;

    return (
        <Pressable
            style={[
                styles.sessionRow,
                showBorder && styles.sessionRowWithBorder,
                selected && styles.sessionRowSelected
            ]}
            onPressIn={() => {
                if (isTablet) {
                    navigateToSession(session.id);
                }
            }}
            onPress={() => {
                if (!isTablet) {
                    navigateToSession(session.id);
                }
            }}
            onLongPress={handleLongPress}
            delayLongPress={500}
            // @ts-ignore - onContextMenu is available on web
            onContextMenu={handleContextMenu}
        >
            <View style={styles.sessionContent}>
                {/* Title line with status */}
                <View style={styles.sessionTitleRow}>
                    {/* Status dot or draft icon on the left */}
                    {(() => {
                        // Show draft icon when online with draft
                        if (sessionStatus.state === 'waiting' && session.draft) {
                            return (
                                <Ionicons
                                    name="create-outline"
                                    size={14}
                                    color={theme.colors.textSecondary}
                                    style={{ marginRight: 8 }}
                                />
                            );
                        }

                        // Show status dot only for permission_required/thinking states
                        if (sessionStatus.state === 'permission_required' || sessionStatus.state === 'thinking') {
                            return (
                                <View style={[styles.statusDotContainer, { marginRight: 8 }]}>
                                    <StatusDot
                                        color={sessionStatus.statusDotColor}
                                        isPulsing={sessionStatus.isPulsing}
                                    />
                                </View>
                            );
                        }

                        // Show green dot for unread, grey for read (when online without draft)
                        if (sessionStatus.state === 'waiting') {
                            return (
                                <View style={[styles.statusDotContainer, { marginRight: 8 }]}>
                                    <StatusDot
                                        color={hasUnread ? '#34C759' : theme.colors.textSecondary}
                                        isPulsing={false}
                                    />
                                </View>
                            );
                        }

                        return null;
                    })()}

                    <Text
                        style={[
                            styles.sessionTitle,
                            sessionStatus.isConnected ? styles.sessionTitleConnected : styles.sessionTitleDisconnected
                        ]}
                        numberOfLines={2}
                    >
                        {sessionName}
                    </Text>
                </View>
            </View>
        </Pressable>
    );
});

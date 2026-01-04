import React from 'react';
import { View, Pressable, Platform, LayoutChangeEvent } from 'react-native';
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
const CollapsibleCard = React.memo(({ collapsed, children }: { collapsed: boolean; children: React.ReactNode }) => {
    const [measuredHeight, setMeasuredHeight] = React.useState(0);
    const animatedHeight = useSharedValue(collapsed ? 0 : 1);
    const hasInitialized = React.useRef(false);

    React.useEffect(() => {
        // Skip animation on initial render if already collapsed
        if (!hasInitialized.current) {
            hasInitialized.current = true;
            animatedHeight.value = collapsed ? 0 : 1;
            return;
        }
        animatedHeight.value = withTiming(collapsed ? 0 : 1, { duration: 200 });
    }, [collapsed, animatedHeight]);

    const handleLayout = React.useCallback((event: LayoutChangeEvent) => {
        const height = event.nativeEvent.layout.height;
        if (height > 0) {
            setMeasuredHeight(height);
        }
    }, []);

    const animatedStyle = useAnimatedStyle(() => {
        // If collapsed and no height measured yet, hide completely
        if (measuredHeight === 0 && collapsed) {
            return { height: 0, opacity: 0, overflow: 'hidden' as const };
        }
        // If expanded but no height measured yet, show with auto height
        if (measuredHeight === 0) {
            return { opacity: 1 };
        }
        // Normal animated state
        return {
            height: interpolate(animatedHeight.value, [0, 1], [0, measuredHeight]),
            opacity: animatedHeight.value,
            overflow: 'hidden' as const,
        };
    });

    // Always render content but measure on layout
    // Use opacity 0 and position absolute for initial measurement when collapsed
    if (measuredHeight === 0 && collapsed) {
        return (
            <>
                {/* Hidden measuring container */}
                <View
                    style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
                    onLayout={handleLayout}
                >
                    <View style={stylesheet.projectCard}>
                        {children}
                    </View>
                </View>
                {/* Empty placeholder with 0 height */}
                <Animated.View style={[stylesheet.projectCard, animatedStyle]} />
            </>
        );
    }

    return (
        <Animated.View style={[stylesheet.projectCard, animatedStyle]} onLayout={measuredHeight === 0 ? handleLayout : undefined}>
            {children}
        </Animated.View>
    );
});

export function ActiveSessionsGroupCompact({ sessions, selectedSessionId }: ActiveSessionsGroupProps) {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const machines = useAllMachines();
    const [collapsedPaths, setCollapsedPaths] = useLocalSettingMutable('collapsedProjectPaths');

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

                return (
                    <View key={projectPath}>
                        {/* Section header on grouped background */}
                        <Pressable
                            style={styles.sectionHeader}
                            onPress={() => toggleCollapsed(projectPath)}
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
                        <CollapsibleCard collapsed={collapsed}>
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
                                        baseOpacity={hasUnread ? 1 : 0.2}
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

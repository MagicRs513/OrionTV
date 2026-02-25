import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, FlatList, StyleSheet, ActivityIndicator, Modal, useTVEventHandler, HWEvent, Text, Alert } from "react-native";
import LivePlayer from "@/components/LivePlayer";
import { fetchAndParseM3u, getPlayableUrl, Channel } from "@/services/m3u";
import { ThemedView } from "@/components/ThemedView";
import { StyledButton } from "@/components/StyledButton";
import { useSettingsStore } from "@/stores/settingsStore";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { getCommonResponsiveStyles } from "@/utils/ResponsiveStyles";
import ResponsiveNavigation from "@/components/navigation/ResponsiveNavigation";
import ResponsiveHeader from "@/components/navigation/ResponsiveHeader";
import { DeviceUtils } from "@/utils/DeviceUtils";

export default function LiveScreen() {
  const { m3uUrl } = useSettingsStore();
  
  const responsiveConfig = useResponsiveLayout();
  const commonStyles = getCommonResponsiveStyles(responsiveConfig);
  const { deviceType, spacing } = responsiveConfig;

  const [channels, setChannels] = useState<Channel[]>([]);
  const [groupedChannels, setGroupedChannels] = useState<Record<string, Channel[]>>({});
  const [channelGroups, setChannelGroups] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>("");

  const [currentChannelIndex, setCurrentChannelIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isChannelListVisible, setIsChannelListVisible] = useState(false);
  const [channelTitle, setChannelTitle] = useState<string | null>(null);
  const titleTimer = useRef<NodeJS.Timeout | null>(null);

  const selectedChannelUrl = channels.length > 0 ? getPlayableUrl(channels[currentChannelIndex].url) : null;

  useEffect(() => {
    const loadChannels = async () => {
      if (!m3uUrl) {
        setLoadError('请先设置直播源地址');
        return;
      }
      
      setIsLoading(true);
      setLoadError(null);
      setChannels([]);
      setGroupedChannels({});
      setChannelGroups([]);
      
      const result = await fetchAndParseM3u(m3uUrl);
      
      if (result.error) {
        setLoadError(result.error);
        setIsLoading(false);
        return;
      }
      
      const parsedChannels = result.channels;
      setChannels(parsedChannels);

      const groups: Record<string, Channel[]> = parsedChannels.reduce((acc, channel) => {
        const groupName = channel.group || "Other";
        if (!acc[groupName]) {
          acc[groupName] = [];
        }
        acc[groupName].push(channel);
        return acc;
      }, {} as Record<string, Channel[]>);

      const groupNames = Object.keys(groups);
      setGroupedChannels(groups);
      setChannelGroups(groupNames);
      setSelectedGroup(groupNames[0] || "");

      if (parsedChannels.length > 0) {
        showChannelTitle(parsedChannels[0].name);
      }
      setIsLoading(false);
    };
    loadChannels();
  }, [m3uUrl]);

  const showChannelTitle = (title: string) => {
    setChannelTitle(title);
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => setChannelTitle(null), 3000);
  };

  const handleSelectChannel = (channel: Channel) => {
    const globalIndex = channels.findIndex((c) => c.id === channel.id);
    if (globalIndex !== -1) {
      setCurrentChannelIndex(globalIndex);
      showChannelTitle(channel.name);
      setIsChannelListVisible(false);
    }
  };

  const changeChannel = useCallback(
    (direction: "next" | "prev") => {
      if (channels.length === 0) return;
      let newIndex =
        direction === "next"
          ? (currentChannelIndex + 1) % channels.length
          : (currentChannelIndex - 1 + channels.length) % channels.length;
      setCurrentChannelIndex(newIndex);
      showChannelTitle(channels[newIndex].name);
    },
    [channels, currentChannelIndex]
  );

  const handleTVEvent = useCallback(
    (event: HWEvent) => {
      if (deviceType !== 'tv') return;
      if (isChannelListVisible) return;
      if (event.eventType === "down") setIsChannelListVisible(true);
      else if (event.eventType === "left") changeChannel("prev");
      else if (event.eventType === "right") changeChannel("next");
    },
    [changeChannel, isChannelListVisible, deviceType]
  );

  useTVEventHandler(deviceType === 'tv' ? handleTVEvent : () => {});

  const dynamicStyles = createResponsiveStyles(deviceType, spacing);

  const renderLiveContent = () => {
    if (isLoading) {
      return (
        <View style={dynamicStyles.loadingContainer}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={dynamicStyles.messageText}>正在加载直播源...</Text>
        </View>
      );
    }

    if (loadError) {
      return (
        <View style={dynamicStyles.errorContainer}>
          <Text style={dynamicStyles.errorText}>加载失败</Text>
          <Text style={dynamicStyles.errorDetailText}>{loadError}</Text>
          <StyledButton
            text="重试"
            onPress={() => {
              setLoadError(null);
              const loadChannels = async () => {
                if (!m3uUrl) {
                  setLoadError('请先设置直播源地址');
                  return;
                }
                setIsLoading(true);
                const result = await fetchAndParseM3u(m3uUrl);
                if (result.error) {
                  setLoadError(result.error);
                  setIsLoading(false);
                  return;
                }
                const parsedChannels = result.channels;
                setChannels(parsedChannels);
                const groups: Record<string, Channel[]> = parsedChannels.reduce((acc, channel) => {
                  const groupName = channel.group || "Other";
                  if (!acc[groupName]) {
                    acc[groupName] = [];
                  }
                  acc[groupName].push(channel);
                  return acc;
                }, {} as Record<string, Channel[]>);
                setGroupedChannels(groups);
                setChannelGroups(Object.keys(groups));
                setSelectedGroup(Object.keys(groups)[0] || "");
                if (parsedChannels.length > 0) {
                  showChannelTitle(parsedChannels[0].name);
                }
                setIsLoading(false);
              };
              loadChannels();
            }}
            style={dynamicStyles.retryButton}
          />
        </View>
      );
    }

    return (
      <>
        <LivePlayer 
          streamUrl={selectedChannelUrl} 
          channelTitle={channelTitle} 
          onPlaybackStatusUpdate={() => {}} 
        />
        <Modal
          animationType="slide"
          transparent={true}
          visible={isChannelListVisible}
          onRequestClose={() => setIsChannelListVisible(false)}
        >
          <View style={dynamicStyles.modalContainer}>
            <View style={dynamicStyles.modalContent}>
              <Text style={dynamicStyles.modalTitle}>选择频道 ({channels.length} 个)</Text>
              <View style={dynamicStyles.listContainer}>
                <View style={dynamicStyles.groupColumn}>
                  <FlatList
                    data={channelGroups}
                    keyExtractor={(item, index) => `group-${item}-${index}`}
                    renderItem={({ item }) => (
                      <StyledButton
                        text={item}
                        onPress={() => setSelectedGroup(item)}
                        isSelected={selectedGroup === item}
                        style={dynamicStyles.groupButton}
                        textStyle={dynamicStyles.groupButtonText}
                      />
                    )}
                  />
                </View>
                <View style={dynamicStyles.channelColumn}>
                  <FlatList
                    data={groupedChannels[selectedGroup] || []}
                    keyExtractor={(item, index) => `${item.id}-${item.group}-${index}`}
                    renderItem={({ item }) => (
                      <StyledButton
                        text={item.name || "Unknown Channel"}
                        onPress={() => handleSelectChannel(item)}
                        isSelected={channels[currentChannelIndex]?.id === item.id}
                        hasTVPreferredFocus={channels[currentChannelIndex]?.id === item.id}
                        style={dynamicStyles.channelItem}
                        textStyle={dynamicStyles.channelItemText}
                      />
                    )}
                  />
                </View>
                </View>
              </View>
            </View>
          </Modal>
        </>
      );
    };

  const content = (
    <ThemedView style={[commonStyles.container, dynamicStyles.container]}>
      {renderLiveContent()}
    </ThemedView>
  );

  // 根据设备类型决定是否包装在响应式导航中
  if (deviceType === 'tv') {
    return content;
  }

  return (
    <ResponsiveNavigation>
      <ResponsiveHeader title="直播" showBackButton />
      {content}
    </ResponsiveNavigation>
  );
}

const createResponsiveStyles = (deviceType: string, spacing: number) => {
  const isMobile = deviceType === 'mobile';
  const isTablet = deviceType === 'tablet';
  const minTouchTarget = DeviceUtils.getMinTouchTargetSize();

  return StyleSheet.create({
    container: {
      flex: 1,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#000',
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#000',
      padding: spacing * 2,
    },
    errorText: {
      color: '#ff6b6b',
      fontSize: isMobile ? 18 : 20,
      fontWeight: 'bold',
      marginBottom: spacing,
    },
    errorDetailText: {
      color: '#aaa',
      fontSize: isMobile ? 14 : 16,
      textAlign: 'center',
      marginBottom: spacing * 2,
    },
    retryButton: {
      paddingHorizontal: spacing * 2,
      paddingVertical: spacing,
    },
    messageText: {
      color: '#fff',
      fontSize: isMobile ? 14 : 16,
      marginTop: spacing,
    },
    modalContainer: {
      flex: 1,
      flexDirection: "row",
      justifyContent: isMobile ? "center" : "flex-end",
      backgroundColor: "transparent",
    },
    modalContent: {
      width: isMobile ? '90%' : isTablet ? 400 : 450,
      height: "100%",
      backgroundColor: "rgba(0, 0, 0, 0.85)",
      padding: spacing,
    },
    modalTitle: {
      color: "white",
      marginBottom: spacing / 2,
      textAlign: "center",
      fontSize: isMobile ? 18 : 16,
      fontWeight: "bold",
    },
    listContainer: {
      flex: 1,
      flexDirection: isMobile ? "column" : "row",
    },
    groupColumn: {
      flex: isMobile ? 0 : 1,
      marginRight: isMobile ? 0 : spacing / 2,
      marginBottom: isMobile ? spacing : 0,
      maxHeight: isMobile ? 120 : undefined,
    },
    channelColumn: {
      flex: isMobile ? 1 : 2,
    },
    groupButton: {
      paddingVertical: isMobile ? minTouchTarget / 4 : 8,
      paddingHorizontal: spacing / 2,
      marginVertical: isMobile ? 2 : 4,
      minHeight: isMobile ? minTouchTarget * 0.7 : undefined,
    },
    groupButtonText: {
      fontSize: isMobile ? 14 : 13,
    },
    channelItem: {
      paddingVertical: isMobile ? minTouchTarget / 5 : 6,
      paddingHorizontal: spacing,
      marginVertical: isMobile ? 2 : 3,
      minHeight: isMobile ? minTouchTarget * 0.8 : undefined,
    },
    channelItemText: {
      fontSize: isMobile ? 14 : 12,
    },
  });
};

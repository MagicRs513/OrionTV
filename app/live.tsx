import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { View, FlatList, StyleSheet, ActivityIndicator, Modal, useTVEventHandler, HWEvent, Text } from "react-native";
import LivePlayer from "@/components/LivePlayer";
import LiveWebViewFallback from "@/components/LiveWebViewFallback";
import { api, IPTVChannel, IPTVSource } from "@/services/api";
import { fetchAndParseM3u } from "@/services/m3u";
import { ThemedView } from "@/components/ThemedView";
import { StyledButton } from "@/components/StyledButton";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { getCommonResponsiveStyles } from "@/utils/ResponsiveStyles";
import ResponsiveNavigation from "@/components/navigation/ResponsiveNavigation";
import ResponsiveHeader from "@/components/navigation/ResponsiveHeader";
import { DeviceUtils } from "@/utils/DeviceUtils";
import useAuthStore from "@/stores/authStore";
import Logger from "@/utils/Logger";

const logger = Logger.withTag('LiveScreen');

const DEFAULT_M3U_URL = "https://oa.fushanhn.com/";

const fixStreamUrl = (url: string): string => {
  const normalizeFushanChannelPath = (rawUrl: string): string => {
    try {
      const parsed = new URL(rawUrl);
      const isFushanHost = parsed.hostname === 'oa.fushanhn.com';
      const isNumericChannelPath = /^\/\d+$/.test(parsed.pathname);

      if (isFushanHost && isNumericChannelPath) {
        parsed.pathname = `${parsed.pathname}/`;
        return parsed.toString();
      }

      return rawUrl;
    } catch {
      return rawUrl;
    }
  };

  if (url.includes('fushanhn.comt/')) {
    const normalizedUrl = url.replace('fushanhn.comt/', 'fushanhn.com/');
    logger.warn(`[URL] Fixing possible domain typo: ${normalizedUrl}`);
    return normalizeFushanChannelPath(normalizedUrl);
  }

  if (url.includes('fushanhn.con/')) {
    const normalizedUrl = url.replace('fushanhn.con/', 'fushanhn.com/');
    logger.warn(`[URL] Fixing possible domain typo: ${normalizedUrl}`);
    return normalizeFushanChannelPath(normalizedUrl);
  }

  if (url.startsWith('https://oa.fushanhn.com//')) {
    return normalizeFushanChannelPath(url.replace('https://oa.fushanhn.com//', 'https://oa.fushanhn.com/'));
  }
  if (url.startsWith('https://oa.fushanhn.com/')) {
    return normalizeFushanChannelPath(url);
  }
  if (url.startsWith('http://')) {
    const httpsUrl = url.replace('http://', 'https://');
    logger.info(`[URL] Converting HTTP to HTTPS: ${httpsUrl}`);
    return normalizeFushanChannelPath(httpsUrl);
  }
  if (url.startsWith('https://')) {
    return normalizeFushanChannelPath(url);
  }
  return url;
};

export default function LiveScreen() {
  const { isLoggedIn, isLoginModalVisible } = useAuthStore();
  
  const responsiveConfig = useResponsiveLayout();
  const commonStyles = getCommonResponsiveStyles(responsiveConfig);
  const { deviceType, spacing } = responsiveConfig;

  const [sources, setSources] = useState<IPTVSource[]>([]);
  const [currentSource, setCurrentSource] = useState<IPTVSource | null>(null);
  const [channels, setChannels] = useState<IPTVChannel[]>([]);
  const [groupedChannels, setGroupedChannels] = useState<Record<string, IPTVChannel[]>>({});
  const [channelGroups, setChannelGroups] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>("");

  const [currentChannelIndex, setCurrentChannelIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isChannelListVisible, setIsChannelListVisible] = useState(false);
  const [channelTitle, setChannelTitle] = useState<string | null>(null);
  const [forceProxyChannelIds, setForceProxyChannelIds] = useState<Record<string, true>>({});
  const [useVideoProxyFallback, setUseVideoProxyFallback] = useState(false);
  const [useWebViewFallback, setUseWebViewFallback] = useState(false);
  const titleTimer = useRef<NodeJS.Timeout | null>(null);

  const selectedChannel = channels.length > 0 && currentChannelIndex < channels.length 
    ? channels[currentChannelIndex] 
    : null;
  
  const streamSelection = useMemo(() => {
    if (!selectedChannel || !currentSource) {
      return { streamUrl: null as string | null, isUsingProxy: false };
    }

    const originalUrl = fixStreamUrl(selectedChannel.url);
    return {
      streamUrl: api.getVideoProxyUrl(originalUrl, currentSource.ua),
      isUsingProxy: true,
    };
  }, [selectedChannel, currentSource]);

  const streamUrl = streamSelection.streamUrl;
  const isUsingProxy = streamSelection.isUsingProxy;
  const userAgent = currentSource?.ua || undefined;
  const playerRefreshKey = useMemo(() => {
    const channelFactor = (currentChannelIndex + 1) * 100;
    const proxyFactor = isUsingProxy ? 10 : 0;
    const videoProxyFactor = useVideoProxyFallback ? 1 : 0;
    return channelFactor + proxyFactor + videoProxyFactor;
  }, [currentChannelIndex, isUsingProxy, useVideoProxyFallback]);
  const webViewStreamUrl = useMemo(() => {
    if (!streamUrl) {
      return null;
    }

    if (isUsingProxy) {
      return streamUrl;
    }

    return api.getVideoProxyUrl(streamUrl, userAgent);
  }, [streamUrl, isUsingProxy, userAgent]);

  const webViewFallbackUrls = useMemo(() => {
    if (!selectedChannel || !currentSource) {
      return [] as string[];
    }

    const originalUrl = fixStreamUrl(selectedChannel.url);
    const streamProxy = api.getIPTVStreamProxyUrl(originalUrl, currentSource.id, currentSource.ua);
    const videoProxy = api.getVideoProxyUrl(originalUrl, currentSource.ua);
    return [streamProxy, videoProxy];
  }, [selectedChannel, currentSource]);

  useEffect(() => {
    if (isLoggedIn && !isLoginModalVisible) {
      loadSources();
    }
  }, [isLoggedIn, isLoginModalVisible]);

  const loadSources = async () => {
    setIsLoading(true);
    setLoadError(null);
    setSources([]);
    setCurrentSource(null);
    setChannels([]);
    
    try {
      const sourcesData = await api.getIPTVSources();
      
      if (sourcesData.length === 0) {
        logger.info('No sources from backend, using default M3U URL');
        await loadDefaultM3U();
        return;
      }
      
      setSources(sourcesData);
      const firstSource = sourcesData[0];
      setCurrentSource(firstSource);
      
      await loadChannels(firstSource.id);
    } catch (error) {
      logger.error('Failed to load sources:', error);
      if (error instanceof Error && error.message === 'UNAUTHORIZED') {
        setLoadError('请先登录');
      } else {
        logger.info('Backend failed, trying default M3U URL');
        await loadDefaultM3U();
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loadDefaultM3U = async () => {
    setIsLoading(true);
    setLoadError(null);
    
    try {
      logger.info(`Loading default M3U from: ${DEFAULT_M3U_URL}`);
      const result = await fetchAndParseM3u(DEFAULT_M3U_URL);
      
      if (result.error || result.channels.length === 0) {
        setLoadError(result.error || '无法加载直播频道');
        return;
      }
      
      const defaultSource: IPTVSource = {
        id: 'default',
        name: '默认直播源',
        url: DEFAULT_M3U_URL,
        isActive: true,
        ua: 'AptvPlayer/1.4.10',
      };
      
      setSources([defaultSource]);
      setCurrentSource(defaultSource);
      
      const channels: IPTVChannel[] = result.channels.map((ch, index) => ({
        id: ch.id || `ch-${index}`,
        name: ch.name,
        url: fixStreamUrl(ch.url),
        logo: ch.logo,
        group: ch.group,
      }));
      
      setChannels(channels);
      
      const groups: Record<string, IPTVChannel[]> = channels.reduce((acc, channel) => {
        const groupName = channel.group || "其他";
        if (!acc[groupName]) {
          acc[groupName] = [];
        }
        acc[groupName].push(channel);
        return acc;
      }, {} as Record<string, IPTVChannel[]>);
      
      const groupNames = Object.keys(groups);
      setGroupedChannels(groups);
      setChannelGroups(groupNames);
      setSelectedGroup(groupNames[0] || "");
      
      if (channels.length > 0) {
        showChannelTitle(channels[0].name);
      }
      
      logger.info(`Loaded ${channels.length} channels from default M3U`);
    } catch (error) {
      logger.error('Failed to load default M3U:', error);
      setLoadError('加载直播源失败，请检查网络连接');
    } finally {
      setIsLoading(false);
    }
  };

  const loadChannels = async (sourceId: string) => {
    setIsLoadingChannels(true);
    setChannels([]);
    setGroupedChannels({});
    setChannelGroups([]);
    
    try {
      let channelsData: IPTVChannel[];
      
      if (sourceId === 'default') {
        const result = await fetchAndParseM3u(DEFAULT_M3U_URL);
        if (result.error || result.channels.length === 0) {
          setLoadError(result.error || '该直播源暂无频道');
          setIsLoadingChannels(false);
          return;
        }
        channelsData = result.channels.map((ch, index) => ({
          id: ch.id || `ch-${index}`,
          name: ch.name,
          url: fixStreamUrl(ch.url),
          logo: ch.logo,
          group: ch.group,
        }));
      } else {
        channelsData = await api.getIPTVChannels(sourceId);
      }
      
      if (channelsData.length === 0) {
        setLoadError('该直播源暂无频道');
        setIsLoadingChannels(false);
        return;
      }
      
      setChannels(channelsData);

      const groups: Record<string, IPTVChannel[]> = channelsData.reduce((acc, channel) => {
        const groupName = channel.group || "其他";
        if (!acc[groupName]) {
          acc[groupName] = [];
        }
        acc[groupName].push(channel);
        return acc;
      }, {} as Record<string, IPTVChannel[]>);

      const groupNames = Object.keys(groups);
      setGroupedChannels(groups);
      setChannelGroups(groupNames);
      setSelectedGroup(groupNames[0] || "");

      if (channelsData.length > 0) {
        showChannelTitle(channelsData[0].name);
      }
    } catch (error) {
      logger.error('Failed to load channels:', error);
      setLoadError('加载频道失败');
    } finally {
      setIsLoadingChannels(false);
    }
  };

  const handleSourceChange = async (source: IPTVSource) => {
    setCurrentSource(source);
    setCurrentChannelIndex(0);
    setUseVideoProxyFallback(false);
    setUseWebViewFallback(false);
    setLoadError(null);
    await loadChannels(source.id);
  };

  const showChannelTitle = (title: string) => {
    setChannelTitle(title);
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => setChannelTitle(null), 3000);
  };

  const handleSelectChannel = (channel: IPTVChannel) => {
    const globalIndex = channels.findIndex((c) => c.id === channel.id);
    if (globalIndex !== -1) {
      setCurrentChannelIndex(globalIndex);
      setUseVideoProxyFallback(false);
      setUseWebViewFallback(false);
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
      setUseVideoProxyFallback(false);
      setUseWebViewFallback(false);
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

  const handlePlaybackError = useCallback(
    (message: string) => {
      if (!selectedChannel || !currentSource || isUsingProxy) {
        const normalized = message.toLowerCase();
        const isExtractorError =
          normalized.includes('none of the available extractors') ||
          normalized.includes('could read the stream') ||
          normalized.includes('could not read the stream');
        const isContainerUnsupportedError =
          normalized.includes('error_code_parsing_container_unsupported') ||
          normalized.includes('parsing_container_unsupported') ||
          normalized.includes('container unsupported');
        const maybeProxyStreamError =
          normalized.includes('response code: 404') ||
          normalized.includes('http 404') ||
          normalized.includes('http 403') ||
          normalized.includes('forbidden') ||
          normalized.includes('/api/proxy/stream') ||
          normalized.includes('/api/video-proxy') ||
          normalized.includes('source not found') ||
          normalized.includes('upstream error') ||
          normalized.includes('playback failed');

        if (selectedChannel && isUsingProxy && (isExtractorError || isContainerUnsupportedError) && !useVideoProxyFallback) {
          logger.warn(`[PROXY] Extractor failed on /api/proxy/stream, retrying with /api/video-proxy: ${selectedChannel.name}`);
          setUseVideoProxyFallback(true);
          showChannelTitle(`${selectedChannel.name}（切换备用代理）`);
          return;
        }

        if (selectedChannel && isUsingProxy && isExtractorError && useVideoProxyFallback) {
          logger.warn(`[PROXY] /api/video-proxy extractor failed, fallback to WebView: ${selectedChannel.name}`);
          setUseWebViewFallback(true);
          showChannelTitle(`${selectedChannel.name}（切换 WebView 兜底）`);
          return;
        }

        if (selectedChannel && isUsingProxy && isContainerUnsupportedError && useVideoProxyFallback) {
          logger.warn(`[PROXY] /api/video-proxy container unsupported, fallback to WebView: ${selectedChannel.name}`);
          setUseWebViewFallback(true);
          showChannelTitle(`${selectedChannel.name}（切换 WebView 兜底）`);
          return;
        }

        if (selectedChannel && isUsingProxy && maybeProxyStreamError) {
          logger.warn(`[PROXY] Proxy endpoint failed, fallback to WebView: ${selectedChannel.name}`);
          setUseWebViewFallback(true);
          showChannelTitle(`${selectedChannel.name}（代理失败，切换 WebView）`);
        }
        return;
      }

      const normalized = message.toLowerCase();
      const isNetworkConnectionError =
        normalized.includes('networkerror') ||
        normalized.includes('error_code_io_network_connection_failed') ||
        normalized.includes('network connection failed') ||
        normalized.includes('failed to connect') ||
        normalized.includes('httpdatasourceexception') ||
        normalized.includes('connection refused') ||
        normalized.includes('connection reset') ||
        normalized.includes('unknownhostexception') ||
        normalized.includes('sslhandshakeexception') ||
        normalized.includes('unable to connect');
      const isCleartextError = normalized.includes('cleartext communication') || normalized.includes('unknownserviceexception cleartext');

      if (!isCleartextError) {
        const maybeProxyStreamError =
          normalized.includes('response code: 404') ||
          normalized.includes('http 404') ||
          normalized.includes('http 403') ||
          normalized.includes('forbidden') ||
          normalized.includes('/api/proxy/stream') ||
          normalized.includes('source not found') ||
          normalized.includes('upstream error') ||
          normalized.includes('playback failed');

        if (!isUsingProxy && isNetworkConnectionError) {
          logger.warn(`[PROXY] Direct connection failed, fallback to proxy for channel: ${selectedChannel.name}`);
          setForceProxyChannelIds((prev) => ({ ...prev, [selectedChannel.id]: true }));
          setUseVideoProxyFallback(false);
          showChannelTitle(`${selectedChannel.name}（直连失败，切换代理）`);
          return;
        }

        if (isUsingProxy && maybeProxyStreamError && !useVideoProxyFallback) {
          logger.warn(`[PROXY] /api/proxy/stream failed, retrying with /api/video-proxy: ${selectedChannel.name}`);
          setUseVideoProxyFallback(true);
          showChannelTitle(`${selectedChannel.name}（切换备用代理）`);
        }
        return;
      }

      logger.warn(`[PROXY] CLEAR-TEXT blocked, fallback to proxy for channel: ${selectedChannel.name}`);
      setForceProxyChannelIds((prev) => ({ ...prev, [selectedChannel.id]: true }));
      setUseVideoProxyFallback(false);
      showChannelTitle(`${selectedChannel.name}（切换代理重试）`);
    },
    [selectedChannel, currentSource, isUsingProxy, useVideoProxyFallback]
  );

  const dynamicStyles = createResponsiveStyles(deviceType, spacing);

  const renderLiveContent = () => {
    if (!isLoggedIn) {
      return (
        <View style={dynamicStyles.loadingContainer}>
          <Text style={dynamicStyles.messageText}>请先登录以观看直播</Text>
        </View>
      );
    }

    if (isLoading) {
      return (
        <View style={dynamicStyles.loadingContainer}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={dynamicStyles.messageText}>正在加载直播源...</Text>
        </View>
      );
    }

    if (loadError && sources.length === 0) {
      return (
        <View style={dynamicStyles.errorContainer}>
          <Text style={dynamicStyles.errorText}>加载失败</Text>
          <Text style={dynamicStyles.errorDetailText}>{loadError}</Text>
          <StyledButton
            text="重试"
            onPress={loadSources}
            style={dynamicStyles.retryButton}
          />
        </View>
      );
    }

    if (isLoadingChannels) {
      return (
        <View style={dynamicStyles.loadingContainer}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={dynamicStyles.messageText}>正在加载频道...</Text>
        </View>
      );
    }

    return (
      <>
        {useWebViewFallback && webViewStreamUrl ? (
          <LiveWebViewFallback
            streamUrl={webViewStreamUrl}
            fallbackUrls={webViewFallbackUrls}
            channelTitle={channelTitle}
            onClose={() => setUseWebViewFallback(false)}
          />
        ) : (
          <LivePlayer 
            streamUrl={streamUrl} 
            selectedChannelUrl={selectedChannel?.url || null}
            forceRefreshKey={playerRefreshKey}
            channelTitle={channelTitle}
            userAgent={userAgent}
            onPlaybackStatusUpdate={() => {}}
            onPlaybackError={handlePlaybackError}
            autoRetry={true}
          />
        )}
        <View style={dynamicStyles.directPlayToggle}>
          <Text style={dynamicStyles.modeHint}>
            {useWebViewFallback
              ? "WebView + hls.js 兜底"
              : "代理直放模式"}
          </Text>
        </View>
        <Modal
          animationType="slide"
          transparent={true}
          visible={isChannelListVisible}
          onRequestClose={() => setIsChannelListVisible(false)}
        >
          <View style={dynamicStyles.modalContainer}>
            <View style={dynamicStyles.modalContent}>
              <Text style={dynamicStyles.modalTitle}>
                {currentSource?.name || '直播'} ({channels.length} 个频道)
              </Text>
              
              {sources.length > 1 && (
                <View style={dynamicStyles.sourceSelector}>
                  <FlatList
                    horizontal
                    data={sources}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                      <StyledButton
                        text={item.name}
                        onPress={() => handleSourceChange(item)}
                        isSelected={currentSource?.id === item.id}
                        style={dynamicStyles.sourceButton}
                        textStyle={dynamicStyles.sourceButtonText}
                      />
                    )}
                    style={dynamicStyles.sourceList}
                  />
                </View>
              )}
              
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
    sourceSelector: {
      marginBottom: spacing / 2,
    },
    sourceList: {
      maxHeight: 50,
    },
    sourceButton: {
      paddingHorizontal: spacing,
      paddingVertical: spacing / 2,
      marginRight: spacing / 2,
    },
    sourceButtonText: {
      fontSize: isMobile ? 12 : 13,
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
    directPlayToggle: {
      position: 'absolute',
      top: spacing,
      right: spacing,
      zIndex: 10,
      alignItems: 'flex-end',
    },
    directPlayButton: {
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      paddingHorizontal: spacing,
      paddingVertical: spacing / 2,
      borderRadius: 4,
    },
    directPlayButtonText: {
      fontSize: isMobile ? 12 : 14,
      color: '#fff',
    },
    modeHint: {
      color: '#aaa',
      fontSize: isMobile ? 10 : 12,
      marginTop: 4,
    },
    webviewFallbackButton: {
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      paddingHorizontal: spacing,
      paddingVertical: spacing / 2,
      borderRadius: 4,
    },
    webviewFallbackButtonText: {
      fontSize: isMobile ? 12 : 14,
      color: '#fff',
    },
  });
};

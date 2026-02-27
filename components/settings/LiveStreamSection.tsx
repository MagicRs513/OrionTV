import React, { useState, useEffect } from "react";
import { View, StyleSheet, ActivityIndicator, Platform } from "react-native";
import { useTVEventHandler } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { SettingsSection } from "./SettingsSection";
import useAuthStore from "@/stores/authStore";
import { api, IPTVSource } from "@/services/api";
import { useButtonAnimation } from "@/hooks/useAnimation";
import { Colors } from "@/constants/Colors";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import Logger from "@/utils/Logger";

const logger = Logger.withTag('LiveStreamSection');

interface LiveStreamSectionProps {
  onChanged: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onPress?: () => void;
}

export const LiveStreamSection = React.forwardRef<any, LiveStreamSectionProps>(
  ({ onChanged, onFocus, onBlur, onPress }, ref) => {
    const { isLoggedIn } = useAuthStore();
    const [isLoading, setIsLoading] = useState(false);
    const [sources, setSources] = useState<IPTVSource[]>([]);
    const [isSectionFocused, setIsSectionFocused] = useState(false);
    const inputAnimationStyle = useButtonAnimation(isSectionFocused, 1.01);
    const deviceType = useResponsiveLayout().deviceType;

    useEffect(() => {
      if (isLoggedIn) {
        loadSources();
      }
    }, [isLoggedIn]);

    const loadSources = async () => {
      setIsLoading(true);
      try {
        const sourcesData = await api.getIPTVSources();
        setSources(sourcesData);
      } catch (error) {
        logger.error('Failed to load IPTV sources:', error);
      } finally {
        setIsLoading(false);
      }
    };

    const handleSectionFocus = () => {
      setIsSectionFocused(true);
      onFocus?.();
    };

    const handleSectionBlur = () => {
      setIsSectionFocused(false);
      onBlur?.();
    };

    const handleTVEvent = React.useCallback(
      (event: any) => {
        if (isSectionFocused && event.eventType === "select") {
          onPress?.();
        }
      },
      [isSectionFocused, onPress]
    );

    useTVEventHandler(handleTVEvent);

    const renderContent = () => {
      if (!isLoggedIn) {
        return (
          <View style={styles.infoContainer}>
            <ThemedText style={styles.infoText}>请先登录以管理直播源</ThemedText>
          </View>
        );
      }

      if (isLoading) {
        return (
          <View style={styles.infoContainer}>
            <ActivityIndicator size="small" color={Colors.dark.primary} />
            <ThemedText style={styles.infoText}>加载中...</ThemedText>
          </View>
        );
      }

      if (sources.length === 0) {
        return (
          <View style={styles.infoContainer}>
            <ThemedText style={styles.infoText}>暂无直播源配置</ThemedText>
            <ThemedText style={styles.hintText}>
              请在 LunaTV 后台管理页面配置 IPTV 直播源
            </ThemedText>
          </View>
        );
      }

      return (
        <View style={styles.sourcesContainer}>
          <ThemedText style={styles.sourceCount}>
            已配置 {sources.length} 个直播源
          </ThemedText>
          {sources.map((source, index) => (
            <View key={source.id || index} style={styles.sourceItem}>
              <ThemedText style={styles.sourceName}>
                {source.name || '未命名'}
              </ThemedText>
              <ThemedText style={styles.sourceStatus}>
                {source.isActive ? '已启用' : '已禁用'}
              </ThemedText>
            </View>
          ))}
        </View>
      );
    };

    return (
      <SettingsSection 
        focusable 
        onFocus={handleSectionFocus} 
        onBlur={handleSectionBlur}
        onPress={Platform.isTV || deviceType !== 'tv' ? undefined : onPress}
      >
        <View style={styles.container}>
          <View style={styles.titleContainer}>
            <ThemedText style={styles.sectionTitle}>直播源管理</ThemedText>
            <ThemedText style={styles.subtitle}>
              通过 LunaTV 后台统一管理
            </ThemedText>
          </View>
          {renderContent()}
        </View>
      </SettingsSection>
    );
  }
);

LiveStreamSection.displayName = "LiveStreamSection";

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginRight: 12,
  },
  subtitle: {
    fontSize: 12,
    color: "#888",
    fontStyle: "italic",
  },
  infoContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
  },
  infoText: {
    fontSize: 14,
    color: "#888",
    marginLeft: 8,
  },
  hintText: {
    fontSize: 12,
    color: "#666",
    marginTop: 8,
  },
  sourcesContainer: {
    paddingVertical: 8,
  },
  sourceCount: {
    fontSize: 14,
    color: Colors.dark.primary,
    marginBottom: 12,
  },
  sourceItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#2a2a2c",
    borderRadius: 6,
    marginBottom: 6,
  },
  sourceName: {
    fontSize: 14,
    color: "#fff",
  },
  sourceStatus: {
    fontSize: 12,
    color: "#4CAF50",
  },
});

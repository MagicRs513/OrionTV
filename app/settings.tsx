import React, { useEffect } from "react";
import { View, StyleSheet, Platform } from "react-native";
import { useTVEventHandler } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useSettingsStore } from "@/stores/settingsStore";
import { UpdateSection } from "@/components/settings/UpdateSection";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { getCommonResponsiveStyles } from "@/utils/ResponsiveStyles";
import ResponsiveNavigation from "@/components/navigation/ResponsiveNavigation";
import ResponsiveHeader from "@/components/navigation/ResponsiveHeader";
import { DeviceUtils } from "@/utils/DeviceUtils";
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';

type SectionItem = {
  component: React.ReactElement;
  key: string;
};

const rawSections = [
  Platform.OS === "android" && {
    component: <UpdateSection />,
    key: "update",
  },
] as const;

function isSectionItem(
  item: false | undefined | SectionItem
): item is SectionItem {
  return !!item;
}

export default function SettingsScreen() {
  const { loadSettings } = useSettingsStore();
  const backgroundColor = useThemeColor({}, "background");
  const insets = useSafeAreaInsets();

  const responsiveConfig = useResponsiveLayout();
  const commonStyles = getCommonResponsiveStyles(responsiveConfig);
  const { deviceType, spacing } = responsiveConfig;

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const sections: SectionItem[] = rawSections.filter(isSectionItem);

  const handleTVEvent = React.useCallback(
    (event: any) => {
    },
    []
  );

  useTVEventHandler(deviceType === "tv" ? handleTVEvent : () => { });

  const dynamicStyles = createResponsiveStyles(deviceType, spacing, insets);

  const renderSettingsContent = () => (
    <KeyboardAwareScrollView
      enableOnAndroid={true}
      extraScrollHeight={20}
      keyboardOpeningTime={0}
      keyboardShouldPersistTaps="always"
      scrollEnabled={true}
      style={{ flex: 1, backgroundColor }}
    >
      <ThemedView style={[commonStyles.container, dynamicStyles.container]}>
        {deviceType === "tv" && (
          <View style={dynamicStyles.header}>
            <ThemedText style={dynamicStyles.title}>设置</ThemedText>
          </View>
        )}
        <View style={dynamicStyles.scrollView}>
          {sections.map(item => (
            <View key={item.key} style={dynamicStyles.itemWrapper}>
              {item.component}
            </View>
          ))}
        </View>
      </ThemedView>
    </KeyboardAwareScrollView>
  );

  if (deviceType === "tv") {
    return renderSettingsContent();
  }

  return (
    <ResponsiveNavigation>
      <ResponsiveHeader title="设置" showBackButton />
      {renderSettingsContent()}
    </ResponsiveNavigation>
  );
}

const createResponsiveStyles = (deviceType: string, spacing: number, insets: any) => {
  const isMobile = deviceType === "mobile";
  const isTablet = deviceType === "tablet";
  const isTV = deviceType === "tv";
  const minTouchTarget = DeviceUtils.getMinTouchTargetSize();

  return StyleSheet.create({
    container: {
      flex: 1,
      padding: spacing,
      paddingTop: isTV ? spacing * 2 : isMobile ? insets.top + spacing : insets.top + spacing * 1.5,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: spacing,
    },
    title: {
      fontSize: isMobile ? 24 : isTablet ? 28 : 32,
      fontWeight: "bold",
      paddingTop: spacing,
      color: "white",
    },
    scrollView: {
      flex: 1,
    },
    listContent: {
      paddingBottom: spacing,
    },
    footer: {
      paddingTop: spacing,
      alignItems: isMobile ? "center" : "flex-end",
    },
    saveButton: {
      minHeight: isMobile ? minTouchTarget : isTablet ? 50 : 50,
      width: isMobile ? "100%" : isTablet ? 140 : 120,
      maxWidth: isMobile ? 280 : undefined,
    },
    disabledButton: {
      opacity: 0.5,
    },
    itemWrapper: {
      marginBottom: spacing,
    },
  });
};

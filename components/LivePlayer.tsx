import React, { useRef, useState, useEffect } from "react";
import { View, StyleSheet, Text, ActivityIndicator, ActivityIndicatorProps } from "react-native";
import { Video, ResizeMode, AVPlaybackStatus, VideoSource } from "expo-av";
import { useKeepAwake } from "expo-keep-awake";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface LivePlayerProps {
  streamUrl: string | null;
  channelTitle?: string | null;
  onPlaybackStatusUpdate: (status: AVPlaybackStatus) => void;
}

const PLAYBACK_TIMEOUT = 15000; // 15 seconds

export default function LivePlayer({ streamUrl, channelTitle, onPlaybackStatusUpdate }: LivePlayerProps) {
  const video = useRef<Video>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTimeout, setIsTimeout] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [videoSource, setVideoSource] = useState<VideoSource | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  useKeepAwake();

  useEffect(() => {
    const prepareVideoSource = async () => {
      if (streamUrl) {
        const authCookies = await AsyncStorage.getItem("authCookies");
        const source: VideoSource = {
          uri: streamUrl,
          headers: authCookies ? { Cookie: authCookies } : {},
        };
        setVideoSource(source);
        setIsLoading(true);
        setIsTimeout(false);
        setIsLoaded(false);
        timeoutRef.current = setTimeout(() => {
          setIsTimeout(true);
          setIsLoading(false);
        }, PLAYBACK_TIMEOUT);
      } else {
        setVideoSource(null);
        setIsLoading(false);
        setIsTimeout(false);
        setIsLoaded(false);
      }
    };

    prepareVideoSource();

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [streamUrl]);

  const handlePlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      if (status.isPlaying) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        setIsLoading(false);
        setIsTimeout(false);
        setIsLoaded(true);
      } else if (status.isBuffering) {
        setIsLoading(true);
      }
    } else {
      if (status.error) {
        setIsLoading(false);
        setIsTimeout(true);
        setIsLoaded(false);
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      }
    }
    onPlaybackStatusUpdate(status);
  };

  if (!streamUrl || !videoSource) {
    return (
      <View style={styles.container}>
        <Text style={styles.messageText}>按向下键选择频道</Text>
      </View>
    );
  }

  if (isTimeout) {
    return (
      <View style={styles.container}>
        <Text style={styles.messageText}>加载失败，请重试</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Video
        ref={video}
        style={styles.video}
        source={videoSource}
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay
        onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
        onError={(e) => {
          setIsTimeout(true);
          setIsLoading(false);
        }}
      />
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.messageText}>加载中...</Text>
        </View>
      )}
      {channelTitle && !isLoading && !isTimeout && (
        <View style={styles.overlay}>
          <Text style={styles.title}>{channelTitle}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  video: {
    flex: 1,
    alignSelf: "stretch",
  },
  overlay: {
    position: "absolute",
    top: 20,
    left: 20,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    padding: 10,
    borderRadius: 5,
  },
  title: {
    color: "#fff",
    fontSize: 18,
  },
  messageText: {
    color: "#fff",
    fontSize: 16,
    marginTop: 10,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
});

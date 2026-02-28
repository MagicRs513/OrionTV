import React, { useRef, useState, useEffect } from "react";
import { View, StyleSheet, Text, ActivityIndicator, ActivityIndicatorProps } from "react-native";
import { Video, ResizeMode, AVPlaybackStatus, VideoSource } from "expo-av";
import { useKeepAwake } from "expo-keep-awake";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Logger from '@/utils/Logger';

const logger = Logger.withTag('LivePlayer');

interface LivePlayerProps {
  streamUrl: string | null;
  channelTitle?: string | null;
  userAgent?: string;
  onPlaybackStatusUpdate: (status: AVPlaybackStatus) => void;
}

const PLAYBACK_TIMEOUT = 30000; // 30 seconds for live streams

export default function LivePlayer({ streamUrl, channelTitle, userAgent, onPlaybackStatusUpdate }: LivePlayerProps) {
  const video = useRef<Video>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTimeout, setIsTimeout] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [videoSource, setVideoSource] = useState<VideoSource | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  useKeepAwake();

  useEffect(() => {
    const prepareVideoSource = async () => {
      if (streamUrl) {
        logger.info(`[STREAM] Preparing video source: ${streamUrl.substring(0, 100)}...`);
        logger.info(`[STREAM] User-Agent: ${userAgent || 'default'}`);
        
        const authCookies = await AsyncStorage.getItem("authCookies");
        const source: VideoSource = {
          uri: streamUrl,
          headers: {
            ...(authCookies ? { Cookie: authCookies } : {}),
            ...(userAgent ? { "User-Agent": userAgent } : {}),
          },
        };
        
        logger.info(`[STREAM] Video source prepared with headers: ${JSON.stringify(Object.keys(source.headers || {}))}`);
        setVideoSource(source);
        setIsLoading(true);
        setIsTimeout(false);
        setIsLoaded(false);
        setErrorMessage(null);
        timeoutRef.current = setTimeout(() => {
          logger.error(`[STREAM] Playback timeout after ${PLAYBACK_TIMEOUT}ms`);
          setIsTimeout(true);
          setIsLoading(false);
          setErrorMessage('播放超时，请检查网络或尝试其他频道');
        }, PLAYBACK_TIMEOUT);
      } else {
        logger.info(`[STREAM] No stream URL provided`);
        setVideoSource(null);
        setIsLoading(false);
        setIsTimeout(false);
        setIsLoaded(false);
        setErrorMessage(null);
      }
    };

    prepareVideoSource();

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [streamUrl, userAgent]);

  const handlePlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      if (status.isPlaying) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        if (!isLoaded) {
          logger.info(`[STREAM] Playback started successfully`);
        }
        setIsLoading(false);
        setIsTimeout(false);
        setIsLoaded(true);
        setErrorMessage(null);
      } else if (status.isBuffering) {
        logger.debug(`[STREAM] Buffering...`);
        setIsLoading(true);
      }
    } else {
      if (status.error) {
        const errorMsg = status.error.message || status.error.toString();
        logger.error(`[STREAM] Playback status error: ${errorMsg}`);
        setIsLoading(false);
        setIsTimeout(true);
        setIsLoaded(false);
        setErrorMessage(errorMsg);
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
        <Text style={styles.messageText}>{errorMessage || '加载失败，请重试'}</Text>
        {errorMessage && <Text style={styles.errorDetailText}>{errorMessage}</Text>}
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
          const errorInfo = e as any;
          const errorMsg = errorInfo?.message || errorInfo?.error?.message || errorInfo?.error?.toString() || JSON.stringify(errorInfo);
          logger.error(`[STREAM] Video onError: ${errorMsg}`);
          logger.error(`[STREAM] Error details:`, errorInfo);
          setIsTimeout(true);
          setIsLoading(false);
          setErrorMessage(errorMsg);
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
  errorDetailText: {
    color: "#aaa",
    fontSize: 12,
    marginTop: 8,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
});

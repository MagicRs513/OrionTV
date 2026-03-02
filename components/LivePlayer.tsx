import React, { useRef, useState, useEffect, useCallback } from "react";
import { View, StyleSheet, Text, ActivityIndicator, ActivityIndicatorProps } from "react-native";
import { Video, ResizeMode, AVPlaybackStatus } from "expo-av";
import { useKeepAwake } from "expo-keep-awake";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Logger from '@/utils/Logger';

const logger = Logger.withTag('LivePlayer');

interface VideoSource {
  uri: string;
  headers?: Record<string, string>;
}

interface LivePlayerProps {
  streamUrl: string | null;
  channelTitle?: string | null;
  userAgent?: string;
  onPlaybackStatusUpdate: (status: AVPlaybackStatus) => void;
  autoRetry?: boolean;
}

const PLAYBACK_TIMEOUT = 30000;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

function getExtensionFromUrl(url: string): string {
  try {
    const urlPath = url.split('?')[0];
    const extension = urlPath.split('.').pop()?.toLowerCase();
    
    if (extension === 'm3u8') return 'm3u8';
    if (extension === 'mpd') return 'mpd';
    if (extension === 'mp4') return 'mp4';
    if (extension === 'flv') return 'flv';
    if (extension === 'ts') return 'ts';
    
    // 默认返回 m3u8，因为大多数直播流是 HLS
    return 'm3u8';
  } catch {
    return 'm3u8';
  }
}

export default function LivePlayer({ streamUrl, channelTitle, userAgent, onPlaybackStatusUpdate, autoRetry = true }: LivePlayerProps) {
  const video = useRef<Video>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTimeout, setIsTimeout] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [videoSource, setVideoSource] = useState<VideoSource | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useKeepAwake();

  useEffect(() => {
    const prepareVideoSource = async () => {
      if (streamUrl) {
        logger.info(`[STREAM] Preparing video source: ${streamUrl.substring(0, 100)}...`);
        logger.info(`[STREAM] User-Agent: ${userAgent || 'default'}`);
        
        const authCookies = await AsyncStorage.getItem("authCookies");
        
        const defaultUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
        
        const source: VideoSource = {
          uri: streamUrl,
          headers: {
            ...(authCookies ? { Cookie: authCookies } : {}),
            "User-Agent": userAgent || defaultUserAgent,
            "Accept": "*/*",
            "Accept-Encoding": "gzip, deflate",
            "Connection": "keep-alive",
          },
          overrideFileExtensionAndroid: getExtensionFromUrl(streamUrl),
        };
        
        logger.info(`[STREAM] Video source prepared with headers: ${JSON.stringify(Object.keys(source.headers || {}))}`);
        logger.info(`[STREAM] File extension: ${getExtensionFromUrl(streamUrl)}`);
        setVideoSource(source);
        setIsLoading(true);
        setIsTimeout(false);
        setIsLoaded(false);
        setErrorMessage(null);
        setRetryCount(0);
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
        setRetryCount(0);
      }
    };

    prepareVideoSource();

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [streamUrl, userAgent]);

  const handleRetry = useCallback(() => {
    if (retryCount < MAX_RETRIES && autoRetry) {
      logger.info(`[STREAM] Retrying playback (${retryCount + 1}/${MAX_RETRIES})...`);
      setRetryCount(retryCount + 1);
      setIsTimeout(false);
      setErrorMessage(null);
      
      if (video.current) {
        video.current.unloadAsync().then(() => {
          retryTimeoutRef.current = setTimeout(() => {
            if (videoSource) {
              video.current?.loadAsync(videoSource, { shouldPlay: true });
            }
          }, RETRY_DELAY);
        });
      }
    }
  }, [retryCount, autoRetry, videoSource]);

  useEffect(() => {
    if (isTimeout && errorMessage && autoRetry && retryCount < MAX_RETRIES) {
      handleRetry();
    }
  }, [isTimeout, errorMessage, autoRetry, retryCount, handleRetry]);

  const handlePlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      if (status.isPlaying) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        if (!isLoaded) {
          logger.info(`[STREAM] Playback started successfully`);
          setRetryCount(0);
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
        const errorMsg = (status.error as any).message || status.error.toString();
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
    const canRetry = retryCount < MAX_RETRIES;
    return (
      <View style={styles.container}>
        <Text style={styles.messageText}>{errorMessage || '加载失败，请重试'}</Text>
        {retryCount > 0 && <Text style={styles.errorDetailText}>已重试 {retryCount} 次</Text>}
        {errorMessage && <Text style={styles.errorDetailText}>{errorMessage}</Text>}
        {streamUrl && <Text style={styles.urlText}>URL: {streamUrl.substring(0, 80)}...</Text>}
        {canRetry && <Text style={styles.retryText}>正在自动重试...</Text>}
        {!canRetry && <Text style={styles.retryText}>已达到最大重试次数</Text>}
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
        isLooping={false}
        isMuted={false}
        volume={1.0}
        rate={1.0}
        onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
        onError={(e) => {
          const errorInfo = e as any;
          const errorMsg = errorInfo?.message || errorInfo?.error?.message || errorInfo?.error?.toString() || JSON.stringify(errorInfo);
          logger.error(`[STREAM] Video onError: ${errorMsg}`);
          logger.error(`[STREAM] Error details:`, errorInfo);
          logger.error(`[STREAM] Stream URL: ${streamUrl.substring(0, 100)}`);
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
  urlText: {
    color: "#888",
    fontSize: 10,
    marginTop: 8,
    textAlign: "center",
    paddingHorizontal: 20,
    fontFamily: "monospace",
  },
  retryText: {
    color: "#ff9800",
    fontSize: 14,
    marginTop: 10,
    textAlign: "center",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
});

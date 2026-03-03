import React, { useMemo } from "react";
import { View, StyleSheet, Text } from "react-native";
import { WebView } from "react-native-webview";

interface LiveWebViewFallbackProps {
  streamUrl: string;
  fallbackUrls?: string[];
  channelTitle?: string | null;
  onClose?: () => void;
}

function escapeForTemplate(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$");
}

export default function LiveWebViewFallback({ streamUrl, fallbackUrls, channelTitle, onClose }: LiveWebViewFallbackProps) {
  const html = useMemo(() => {
    const safeTitle = escapeForTemplate(channelTitle || "直播");
    const urls = [streamUrl, ...(fallbackUrls || []).filter((url) => url && url !== streamUrl)];
    const safeUrlsJson = JSON.stringify(urls).replace(/</g, "\\u003c");
    return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
    <style>
      html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; }
      #player { width: 100%; height: 100%; background: #000; }
      #title { position: fixed; left: 16px; top: 16px; z-index: 10; color: #fff; font-size: 16px; background: rgba(0,0,0,0.5); padding: 8px 12px; border-radius: 6px; }
      #error { position: fixed; left: 16px; bottom: 16px; right: 16px; z-index: 10; color: #ff6b6b; font-size: 14px; background: rgba(0,0,0,0.65); padding: 8px 12px; border-radius: 6px; display: none; }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js"></script>
  </head>
  <body>
    <div id="title">${safeTitle}</div>
    <div id="error"></div>
    <video id="player" controls autoplay playsinline webkit-playsinline></video>
    <script>
      (function () {
        var urls = ${safeUrlsJson};
        var currentIndex = 0;
        var hls = null;
        var video = document.getElementById("player");
        var errorBox = document.getElementById("error");

        function showError(msg) {
          errorBox.style.display = "block";
          errorBox.textContent = msg;
        }

        function clearError() {
          errorBox.style.display = "none";
          errorBox.textContent = "";
        }

        function currentUrl() {
          return urls[currentIndex] || urls[0];
        }

        function nextUrl() {
          if (currentIndex + 1 >= urls.length) {
            return false;
          }
          currentIndex += 1;
          return true;
        }

        function playDirect(url) {
          video.src = url;
          clearError();
          video.play().catch(function (e) { showError("播放失败: " + (e && e.message ? e.message : e)); });
        }

        function destroyHls() {
          if (hls) {
            try {
              hls.destroy();
            } catch (_e) {}
            hls = null;
          }
        }

        function tryPlayCurrent() {
          var url = currentUrl();
          if (!url) {
            showError("无可用播放地址");
            return;
          }

          destroyHls();

          try {
            if (window.Hls && window.Hls.isSupported()) {
              hls = new window.Hls({ lowLatencyMode: true, backBufferLength: 90 });
              hls.loadSource(url);
              hls.attachMedia(video);
              hls.on(window.Hls.Events.MANIFEST_PARSED, function () {
                clearError();
                video.play().catch(function (e) { showError("自动播放失败: " + (e && e.message ? e.message : e)); });
              });
              hls.on(window.Hls.Events.ERROR, function (_event, data) {
                if (data && data.fatal) {
                  if (nextUrl()) {
                    tryPlayCurrent();
                    return;
                  }
                  showError("HLS 错误: " + (data.type || "unknown"));
                }
              });
              return;
            }
          } catch (_e) {}

          playDirect(url);
        }

        tryPlayCurrent();
      })();
    </script>
  </body>
</html>`;
  }, [streamUrl, fallbackUrls, channelTitle]);

  return (
    <View style={styles.container}>
      <WebView
        source={{ html }}
        originWhitelist={["*"]}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        onError={() => {
          onClose?.();
        }}
        style={styles.webview}
      />
      <View style={styles.tipContainer}>
        <Text style={styles.tipText}>WebView 兜底模式，按返回键退出</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  webview: {
    flex: 1,
    backgroundColor: "#000",
  },
  tipContainer: {
    position: "absolute",
    bottom: 16,
    right: 16,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  tipText: {
    color: "#fff",
    fontSize: 12,
  },
});

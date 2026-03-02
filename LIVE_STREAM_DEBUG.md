# 直播流播放问题诊断

## 当前状态

✅ 后端代理已修复（不再返回 403）
❌ 播放器无法解析直播流

## 错误信息

```
None of the available extractors (c, d, b, g, k, b, a0, d, hO, e, h, b, e, f, b, a) could read the stream.
```

这说明 ExoPlayer 无法识别直播流格式。

## 诊断步骤

### 1. 获取直播流 URL

在你的 APP 中：
1. 打开直播页面
2. 点击右上角按钮切换到"直接播放"模式
3. 查看日志获取实际的直播流 URL

```powershell
adb logcat | Select-String "STREAM|URL"
```

### 2. 测试直播流是否有效

使用 ffmpeg 或 vlc 测试：

```powershell
# 使用 ffmpeg 测试
ffmpeg -i "直播流URL" -f null -

# 使用 VLC 播放器测试
# 直接在 VLC 中打开 URL
```

### 3. 检查直播流格式

常见的直播流格式：

#### HLS (m3u8)
```
http://example.com/live.m3u8
https://example.com/master.m3u8
```
- ExoPlayer 原生支持
- 需要正确的 Content-Type: `application/vnd.apple.mpegurl` 或 `application/x-mpegURL`

#### MPEG-TS
```
http://example.com/live.ts
http://example.com/stream
```
- ExoPlayer 支持
- 需要识别为 MPEG-TS

#### FLV
```
http://example.com/live.flv
```
- ExoPlayer **不支持**原生 FLV
- 需要使用其他播放器库

#### DASH (mpd)
```
http://example.com/live.mpd
```
- ExoPlayer 支持

### 4. 检查直播流响应头

```powershell
curl -I "直播流URL" -H "User-Agent: Mozilla/5.0"
```

查看响应头中的：
- `Content-Type`: 应该是正确的类型
- `Content-Length`: 直播流通常没有这个头
- `Transfer-Encoding`: 应该是 `chunked`

## 解决方案

### 方案 1: 检查后端代理响应头

修改后端代理，添加正确的 Content-Type：

在 `LunaTV/src/app/api/proxy/stream/route.ts` 中：

```typescript
// 在 copyHeader 部分添加特殊处理
if (decodedUrl.includes('.m3u8')) {
  headers.set('Content-Type', 'application/vnd.apple.mpegurl');
} else if (decodedUrl.includes('.ts')) {
  headers.set('Content-Type', 'video/mp2t');
} else if (decodedUrl.includes('.mpd')) {
  headers.set('Content-Type', 'application/dash+xml');
}
```

### 方案 2: 使用其他直播源

如果直播源是 FLV 格式，ExoPlayer 不支持，需要：

1. **更换直播源**：使用 m3u8 或 ts 格式的直播源
2. **使用 WebView + 播放器**：在 WebView 中使用 HLS.js
3. **使用其他播放器库**：如 react-native-video（但它也不支持 FLV）

### 方案 3: 转码直播流

如果必须使用当前直播源，可以在后端转码：

```typescript
// 使用 ffmpeg 转码 FLV -> HLS
ffmpeg -i "input.flv" -c copy -f hls -hls_time 2 -hls_list_size 5 "output.m3u8"
```

### 方案 4: 测试不同的直播源

在 APP 中测试其他直播源：

1. 打开直播页面
2. 点击频道列表
3. 切换不同的直播源
4. 观察是否能播放

## 快速测试

### 测试已知的 HLS 直播源

在 APP 中手动添加一个测试源：

```
# CCTV1 HD (m3u8)
http://ivi.bupt.edu.cn/hls/cctv1hd.m3u8

# 或者使用你的默认 M3U 文件
https://oa.fushanhn.com/
```

### 查看详细日志

```powershell
# 清空日志
adb logcat -c

# 打开直播页面，播放一个频道

# 查看详细错误
adb logcat | Select-String "LivePlayer|ExoPlayer|extractor|mpegts|hls|flv"
```

## 常见问题

### Q: 为什么显示 "None of the available extractors could read the stream"？

A: 可能的原因：
1. 直播流格式不支持（如 FLV）
2. 直播流 URL 无效或已失效
3. Content-Type 不正确
4. 需要特殊的请求头或认证

### Q: 如何确认直播流格式？

A: 查看 URL 后缀或响应头：
- `.m3u8` → HLS
- `.ts` → MPEG-TS
- `.flv` → FLV
- `.mpd` → DASH

### Q: ExoPlayer 支持哪些格式？

A: ExoPlayer 原生支持：
- ✅ HLS (m3u8)
- ✅ DASH (mpd)
- ✅ MPEG-TS
- ✅ MP4
- ✅ WebM
- ❌ FLV（需要扩展）
- ❌ RTMP（需要扩展）

## 下一步

1. **运行 APP 并查看日志**：
   ```powershell
   adb logcat -c
   # 打开直播，播放频道
   adb logcat | Select-String "STREAM"
   ```

2. **提供以下信息**：
   - 直播流的实际 URL（从日志中获取）
   - 直播流的响应头（使用 curl 查看）
   - 使用的直播源名称

3. **根据直播流格式选择解决方案**

## 临时解决方案

如果某些直播源无法播放：

1. **切换到其他直播源**
2. **联系直播源提供者确认格式**
3. **使用其他播放器应用测试同一 URL**
4. **等待后端转码支持**

请提供具体的直播流 URL 和日志信息，我可以提供更精准的解决方案！

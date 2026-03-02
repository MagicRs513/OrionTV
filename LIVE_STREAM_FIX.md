# 直播播放问题解决方案

## 问题分析

你遇到的两个错误：
1. **CLEARTEXT communication error**: Android 阻止了 HTTP 明文通信
2. **403 Forbidden**: 代理服务器或直播源拒绝访问

## 解决方案

### 方案 1: 重新构建 APK（推荐）

**这是最关键的一步！** 网络安全配置必须重新构建 APK 才能生效。

```bash
# 1. 清理旧的构建
yarn clean

# 2. 重新生成 Android 项目并构建
yarn build

# 或者分步执行：
yarn prebuild  # 生成 Android 项目
cd android
./gradlew assembleRelease  # 构建 Release APK
```

构建完成后，安装新的 APK 到设备上测试。

### 方案 2: 检查后端代理配置

如果重新构建后仍然有 403 错误，需要检查后端服务器配置：

1. **检查后端代理是否正常工作**：
   ```bash
   # 测试代理是否可达
   curl "https://any.lumi210.ggff.net/api/proxy/stream?url=测试直播URL&moontv-source=default"
   ```

2. **后端需要支持的配置**：
   - 允许跨域请求 (CORS)
   - 支持直播流的 User-Agent 转发
   - 支持大文件流式传输

### 方案 3: 使用 HTTPS 直播源

如果直播源支持 HTTPS，优先使用 HTTPS 地址：
- 代码已自动将 HTTP 转换为 HTTPS
- 如果转换后无法播放，说明该直播源不支持 HTTPS

### 方案 4: 切换播放模式

在直播页面右上角：
- **默认使用代理播放**：通过服务器转发，避免某些网络限制
- **切换到直接播放**：直接连接直播源，但可能遇到 CLEARTEXT 错误

## 验证步骤

1. 重新构建并安装 APK
2. 打开直播页面
3. 查看日志：
   - 如果看到 "Converting HTTP to HTTPS"，说明正在尝试 HTTPS
   - 如果仍然报 CLEARTEXT 错误，说明 APK 没有更新
4. 尝试切换播放模式
5. 检查后端代理是否返回 403

## 常见问题

### Q: 为什么重新构建后还是报 CLEARTEXT 错误？
A: 检查以下几点：
- 确保卸载了旧版本 APK
- 确保安装的是新构建的 APK
- 检查 `android/app/src/main/res/xml/network_security_config.xml` 是否存在

### Q: 代理播放为什么也返回 403？
A: 可能的原因：
- 后端服务器配置问题
- 后端服务器需要认证
- 后端服务器禁止了某些直播源
- 网络问题（防火墙、代理等）

### Q: 如何查看详细的错误日志？
A: 使用 Android Studio 的 Logcat 或 adb logcat 查看：
```bash
adb logcat | grep -E "LivePlayer|STREAM"
```

## 临时解决方案

如果以上方案都无法解决，可以：

1. **使用其他直播源**：尝试切换到其他直播源
2. **联系后端开发者**：检查后端代理配置
3. **使用 VPN**：某些直播源可能有地区限制

## 技术细节

### 网络安全配置
文件位置：`xml/network_security_config.xml`

已配置的域名：
- miguvideo.com（咪咕直播）
- migu.cn、cmvideo.cn（中国移动）
- live.com、myqcloud.com、qcloud.com（腾讯云）
- ksyun.com、ksyuncdn.com（金山云）
- fushanhn.com、ggff.net（默认源）

### 自动重试机制
播放器会自动重试 3 次，每次间隔 2 秒。

### HTTP 转 HTTPS
代码会自动将 HTTP URL 转换为 HTTPS，避免 CLEARTEXT 错误。

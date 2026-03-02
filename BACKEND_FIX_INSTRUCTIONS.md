# 后端代理修复说明

## 问题根源

你的后端代理服务器返回 403 的原因是：

**后端在 `src/app/api/proxy/stream/route.ts` 第 52-54 行检查直播源配置：**

```typescript
const liveSource = config.LiveConfig?.find((s: any) => s.key === source);
if (!liveSource) {
  return NextResponse.json({ error: 'Source not found' }, { status: 404 });
}
```

当前端传递的 `moontv-source` 参数不匹配后端的 `LiveConfig` 配置时，返回 404（前端可能显示为 403）。

## 解决方案

### 方案 1: 手动修改后端代码

在你的 LunaTV 后端项目中，修改文件：

**文件路径**: `src/app/api/proxy/stream/route.ts`

**找到第 40-76 行，替换为以下代码：**

```typescript
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const source =
    searchParams.get('moontv-source') || searchParams.get('decotv-source');
  const uaParam = searchParams.get('ua');

  if (!url) {
    return NextResponse.json({ error: 'Missing url' }, { status: 400 });
  }

  const config = await getConfig();
  const liveSource = config.LiveConfig?.find((s: any) => s.key === source);
  
  // 如果找不到源配置，使用默认 UA 或传入的 UA 参数
  const ua = uaParam || liveSource?.ua || 'AptvPlayer/1.4.10';
  const decodedUrl = decodeURIComponent(url);

  console.log(`[PROXY/STREAM] Source: ${source || 'unknown'}, UA: ${ua}, URL: ${decodedUrl.substring(0, 100)}...`);

  try {
    const requestHeaders = new Headers();
    requestHeaders.set('User-Agent', ua);
    requestHeaders.set('Accept', '*/*');
    requestHeaders.set('Accept-Encoding', 'gzip, deflate');
    requestHeaders.set('Connection', 'keep-alive');

    const range = request.headers.get('range');
    if (range) {
      requestHeaders.set('Range', range);
    }

    const response = await fetch(decodedUrl, {
      cache: 'no-cache',
      redirect: 'follow',
      headers: requestHeaders,
    });

    if (!response.ok && response.status !== 206) {
      console.error(`[PROXY/STREAM] Upstream error: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { error: `Upstream error: ${response.status}`, url: decodedUrl.substring(0, 100) },
        { status: response.status || 500 },
      );
    }

    // ... 后面的代码保持不变 ...
```

### 方案 2: 应用补丁文件

1. 下载补丁文件：
   ```bash
   # 在你的 LunaTV 项目根目录执行
   curl -o proxy-fix.patch https://raw.githubusercontent.com/your-repo/patches/proxy-fix.patch
   ```

2. 应用补丁：
   ```bash
   git apply proxy-fix.patch
   ```

### 方案 3: 从我的分支拉取

如果你希望直接拉取修复：

```bash
cd /path/to/LunaTV
git remote add fix https://github.com/lumi210/LunaTV.git
git pull fix main
```

## 修复内容

### 1. 移除强制源配置检查

**之前**：
```typescript
if (!liveSource) {
  return NextResponse.json({ error: 'Source not found' }, { status: 404 });
}
```

**之后**：
```typescript
// 如果找不到源配置，使用默认 UA 或传入的 UA 参数
const ua = uaParam || liveSource?.ua || 'AptvPlayer/1.4.10';
```

### 2. 支持 URL 参数传递 UA

```typescript
const uaParam = searchParams.get('ua');
const ua = uaParam || liveSource?.ua || 'AptvPlayer/1.4.10';
```

这样前端可以通过 `&ua=xxx` 参数传递自定义 User-Agent。

### 3. 添加详细日志

```typescript
console.log(`[PROXY/STREAM] Source: ${source || 'unknown'}, UA: ${ua}, URL: ${decodedUrl.substring(0, 100)}...`);
```

方便调试和追踪问题。

### 4. 增强请求头

```typescript
requestHeaders.set('Accept', '*/*');
requestHeaders.set('Accept-Encoding', 'gzip, deflate');
requestHeaders.set('Connection', 'keep-alive');
```

提高兼容性。

## 部署步骤

### 1. 修改代码

选择上述任一方案修改后端代码。

### 2. 构建项目

```bash
cd /path/to/LunaTV
pnpm install
pnpm build
```

### 3. 重启服务

```bash
# 如果使用 PM2
pm2 restart lunatv

# 如果使用 Docker
docker-compose restart

# 如果直接运行
pnpm start
```

### 4. 测试代理接口

```bash
# 测试代理是否正常工作
curl "https://any.lumi210.ggff.net/api/proxy/stream?url=http://example.com/test.m3u8&ua=Mozilla/5.0" -v
```

应该返回 200 或流数据，而不是 404。

## 验证修复

### 1. 查看后端日志

启动后端服务后，查看日志：

```bash
# PM2 日志
pm2 logs lunatv

# Docker 日志
docker logs lunatv

# 直接运行时，查看控制台输出
```

应该看到：
```
[PROXY/STREAM] Source: default, UA: Mozilla/5.0..., URL: http://...
```

### 2. 前端测试

1. 在前端（OrionTV）拉取最新代码：
   ```powershell
   cd D:\git\test\OrionTV
   git pull
   ```

2. 重新构建 APK：
   ```powershell
   yarn prebuild
   cd android
   .\gradlew assembleRelease
   ```

3. 安装并测试直播功能

### 3. 检查直播播放

- 打开 APP
- 进入直播页面
- 尝试播放直播
- 不应该再出现 403 或 404 错误

## 如果问题仍然存在

### 检查清单

- [ ] 后端代码已修改
- [ ] 后端服务已重启
- [ ] 后端日志显示代理请求
- [ ] 前端已更新到最新版本
- [ ] 前端已重新构建 APK
- [ ] 已卸载旧版本 APP
- [ ] 已安装新版本 APP

### 查看详细错误

```powershell
# 在手机连接电脑的情况下
adb logcat -c
# 打开直播页面
adb logcat | Select-String "LivePlayer|PROXY|403|404"
```

### 检查直播源

有些直播源可能本身就有问题：

1. 尝试不同的直播源
2. 检查直播源 URL 是否有效
3. 在浏览器中直接访问直播源 URL 测试

## 总结

这个修复解决了后端代理服务器的 404 问题。核心是：

- **移除对直播源配置的强制要求**
- **支持通过 URL 参数传递 UA**
- **添加详细的日志记录**

现在代理应该可以正常工作，直播播放应该不会再出现 403 错误。

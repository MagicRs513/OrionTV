# 直播代理服务器诊断

## 问题现象

- 直接播放：CLEARTEXT communication error
- 代理播放：403 Forbidden

## 诊断步骤

### 1. 测试后端代理是否可达

```powershell
# 测试后端服务器是否在线
curl https://any.lumi210.ggff.net/api/live/sources

# 如果返回 401 或其他错误，说明后端有问题
```

### 2. 测试代理播放接口

```powershell
# 替换为实际的直播流URL
$streamUrl = "http://example.com/live.m3u8"
$encodedUrl = [System.Web.HttpUtility]::UrlEncode($streamUrl)
$proxyUrl = "https://any.lumi210.ggff.net/api/proxy/stream?url=$encodedUrl&moontv-source=default"

# 测试代理
curl $proxyUrl
```

### 3. 检查后端代码

后端代理服务器需要：

#### 允许跨域 (CORS)
```javascript
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});
```

#### 支持流式代理
```javascript
app.get('/api/proxy/stream', async (req, res) => {
  const { url, ua } = req.query;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': ua || 'Mozilla/5.0...',
        'Accept': '*/*',
      }
    });
    
    // 转发响应头
    res.setHeader('Content-Type', response.headers.get('content-type'));
    
    // 流式传输
    response.body.pipe(res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

#### 处理大文件
```javascript
// 增加超时时间
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
```

## 临时解决方案

### 方案 A: 使用其他直播源

如果后端代理无法修复，建议：
1. 切换到其他直播源（不使用咪咕）
2. 使用支持 HTTPS 的直播源

### 方案 B: 修改直播源地址

如果有咪咕直播的 HTTPS 地址，替换 M3U 文件中的 URL：
- HTTP: `http://hlsztemgsplive.miguvideo.com/...`
- HTTPS: `https://hlsztemgsplive.miguvideo.com/...` (需要确认是否支持)

### 方案 C: 部署自己的代理服务器

如果后端代理无法使用，可以部署一个简单的代理：

```javascript
// server.js
const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.get('/api/proxy/stream', async (req, res) => {
  const { url } = req.query;
  
  const response = await fetch(url);
  response.body.pipe(res);
});

app.listen(3000);
```

然后修改前端 API 地址：
```typescript
// app/live.tsx
const DEFAULT_M3U_URL = "https://your-proxy-server.com/";
```

## 确认清单

- [ ] 拉取最新代码 (git pull)
- [ ] 重新构建 APK (yarn build)
- [ ] 卸载旧版本 APP
- [ ] 安装新版本 APP
- [ ] 测试代理播放是否正常
- [ ] 如果代理播放仍返回 403，检查后端服务器
- [ ] 考虑切换到其他直播源

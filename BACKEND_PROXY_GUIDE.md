# 直播流代理服务器实现指南

## 问题分析

前端错误：
- 直接播放：CLEARTEXT communication error（Android 阻止 HTTP）
- 代理播放：403 Forbidden（后端拒绝访问）

## 后端代理服务器必须实现的功能

### 1. 基础代理接口

```javascript
// Node.js + Express 示例
const express = require('express');
const fetch = require('node-fetch');
const app = express();

// CORS 支持
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// 直播流代理接口
app.get('/api/proxy/stream', async (req, res) => {
  const { url, ua, 'moontv-source': source } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }
  
  try {
    console.log(`[PROXY] Proxying stream: ${url.substring(0, 100)}...`);
    
    // 构建请求头
    const headers = {
      'User-Agent': ua || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': '*/*',
      'Accept-Encoding': 'gzip, deflate',
      'Connection': 'keep-alive',
    };
    
    // 如果有认证 cookie，添加到请求头
    if (req.headers.cookie) {
      headers['Cookie'] = req.headers.cookie;
    }
    
    // 发起请求
    const response = await fetch(url, {
      method: 'GET',
      headers: headers,
      timeout: 30000, // 30秒超时
    });
    
    if (!response.ok) {
      console.error(`[PROXY] Upstream error: ${response.status} ${response.statusText}`);
      return res.status(response.status).json({
        error: `Upstream error: ${response.status}`,
        url: url.substring(0, 100)
      });
    }
    
    // 转发响应头
    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }
    
    // 对于直播流，不设置 Content-Length，使用流式传输
    res.setHeader('Transfer-Encoding', 'chunked');
    
    // 流式传输
    response.body.pipe(res);
    
    // 错误处理
    response.body.on('error', (err) => {
      console.error('[PROXY] Stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Stream error' });
      }
    });
    
    res.on('close', () => {
      console.log('[PROXY] Client disconnected');
      response.body.destroy();
    });
    
  } catch (error) {
    console.error('[PROXY] Error:', error);
    
    if (!res.headersSent) {
      res.status(500).json({
        error: error.message,
        url: url.substring(0, 100)
      });
    }
  }
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});
```

### 2. 必要的配置

#### 增加超时时间

```javascript
// 对于直播流，需要更长的超时时间
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// 全局超时设置
app.use((req, res, next) => {
  req.setTimeout(300000); // 5分钟
  res.setTimeout(300000);
  next();
});
```

#### 支持大文件流式传输

```javascript
// 对于大文件流，需要禁用缓冲
app.get('/api/proxy/stream', async (req, res) => {
  // ... 之前的代码 ...
  
  // 禁用压缩，避免延迟
  res.setHeader('Content-Encoding', 'identity');
  
  // 禁用缓存
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  // ... 流式传输 ...
});
```

### 3. 认证支持

如果你的后端需要认证：

```javascript
// 认证中间件
const authMiddleware = (req, res, next) => {
  // 检查 session 或 token
  const token = req.headers.authorization || req.cookies.token;
  
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // 验证 token
  // ... 你的验证逻辑 ...
  
  next();
};

// 应用到代理接口
app.get('/api/proxy/stream', authMiddleware, async (req, res) => {
  // ... 代理逻辑 ...
});
```

### 4. 日志记录

```javascript
app.get('/api/proxy/stream', async (req, res) => {
  const startTime = Date.now();
  const { url, 'moontv-source': source } = req.query;
  
  console.log(`[PROXY] Request from ${req.ip} for source: ${source}`);
  
  // ... 代理逻辑 ...
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`[PROXY] Completed in ${duration}ms, status: ${res.statusCode}`);
  });
});
```

## Python 实现（Flask）

```python
from flask import Flask, request, Response
import requests

app = Flask(__name__)

@app.route('/api/proxy/stream')
def proxy_stream():
    url = request.args.get('url')
    ua = request.args.get('ua', 'Mozilla/5.0...')
    
    if not url:
        return {'error': 'Missing url parameter'}, 400
    
    try:
        headers = {
            'User-Agent': ua,
            'Accept': '*/*',
        }
        
        # 转发 cookie
        if 'Cookie' in request.headers:
            headers['Cookie'] = request.headers['Cookie']
        
        # 流式请求
        response = requests.get(url, headers=headers, stream=True, timeout=30)
        
        # 流式响应
        def generate():
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    yield chunk
        
        return Response(
            generate(),
            content_type=response.headers.get('content-type'),
            status=response.status_code
        )
        
    except Exception as e:
        return {'error': str(e)}, 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3000)
```

## 常见问题排查

### 问题 1: 403 Forbidden

**原因：**
1. 后端有认证，但前端没有传递 token
2. 后端有 IP 白名单限制
3. 后端防火墙或安全策略拦截

**解决：**
```javascript
// 检查是否有认证中间件
console.log('Auth headers:', req.headers);
console.log('Cookies:', req.cookies);

// 临时禁用认证测试
// app.get('/api/proxy/stream', async (req, res) => { ... })
```

### 问题 2: 连接超时

**原因：**
直播流响应慢，默认超时时间太短

**解决：**
```javascript
// 增加超时时间
const response = await fetch(url, {
  timeout: 60000, // 60秒
});
```

### 问题 3: 流中断

**原因：**
缓冲区满或网络不稳定

**解决：**
```javascript
// 使用更小的缓冲区
response.body.on('data', (chunk) => {
  res.write(chunk);
});
```

## 测试后端代理

### 本地测试

```bash
# 启动后端服务器
node server.js

# 测试代理接口
curl "http://localhost:3000/api/proxy/stream?url=http://example.com/test.m3u8" -v
```

### 远程测试

```bash
# 测试生产环境
curl "https://any.lumi210.ggff.net/api/proxy/stream?url=http://example.com/test.m3u8" -v

# 查看响应头
curl -I "https://any.lumi210.ggff.net/api/proxy/stream?url=http://example.com/test.m3u8"
```

## 部署建议

### Nginx 配置

```nginx
location /api/proxy/stream {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    
    # 增加超时时间
    proxy_connect_timeout 300s;
    proxy_send_timeout 300s;
    proxy_read_timeout 300s;
    
    # 禁用缓冲
    proxy_buffering off;
}
```

### PM2 配置

```json
{
  "apps": [{
    "name": "proxy-server",
    "script": "server.js",
    "instances": 2,
    "exec_mode": "cluster",
    "max_memory_restart": "1G",
    "env": {
      "NODE_ENV": "production",
      "PORT": 3000
    }
  }]
}
```

## 检查清单

- [ ] 后端有 `/api/proxy/stream` 接口
- [ ] 接口支持 GET 方法
- [ ] 支持 `url` 和 `ua` 查询参数
- [ ] 正确转发请求头（特别是 Cookie）
- [ ] 使用流式传输，不是一次性加载
- [ ] 设置了足够的超时时间
- [ ] 添加了 CORS 头
- [ ] 添加了日志记录
- [ ] 测试接口可以正常工作
- [ ] Nginx/反向代理配置正确

## 下一步

1. **检查你的后端代码**：是否有 `/api/proxy/stream` 接口？
2. **查看后端日志**：为什么返回 403？
3. **测试接口**：使用 curl 或 Postman 测试接口
4. **应用上述代码**：如果接口有问题，参考上面的实现

请告诉我你的后端是什么技术栈，我可以提供更具体的帮助！

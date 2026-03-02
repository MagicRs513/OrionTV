# 直播流诊断脚本

## 使用方法

```powershell
# 测试一个直播频道
$testUrl = "https://oa.fushanhn.com/608807420"

# 方法 1: 直接测试
curl -v $testUrl -H "User-Agent: Mozilla/5.0" -L - - 2>&1 | Select-Object "Content-Type"
curl -v $testUrl -H "User-Agent: Mozilla/5.0" -I 2>&1 | Select-String "HTTP|Content-Type|Location"

# 方法 2: 通过后端代理测试  
$proxyUrl = "https://any.lumi210.ggff.net/api/proxy/stream?url=$([System.Web.HttpUtility]::UrlEncode($testUrl))&moontv-source=default"
curl -v $proxyUrl -I 2>&1 | Select-String "HTTP|Content-Type"
```

## 预期结果

查看：
1. **响应状态码**（应该是 200）
2. **Content-Type**（应该是 video/mp2t 或 application/vnd.apple.mpegurl）
3. **是否有重定向**
4. **响应内容的前几个字节**

## 如果 Content-Type 是 application/vnd.apple.mpegurl (HLS)

说明是 HLS 流，应该可以播放。

## 如果 Content-Type 是 video/x-flv

说明是 FLV 流，**ExoPlayer 不支持 FLV**，需要：
1. 更换直播源
2. 使用其他播放器
3. 在后端转码 FLV -> HLS

## 如果 Content-Type 是 application/octet-stream

说明服务器没有正确设置 Content-Type。
需要后端根据内容推断类型。

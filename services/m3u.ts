import Logger from '@/utils/Logger';

const logger = Logger.withTag('M3U');

export interface Channel {
  id: string;
  name: string;
  url: string;
  logo: string;
  group: string;
}

export interface M3UResult {
  channels: Channel[];
  error: string | null;
}

const FETCH_TIMEOUT = 30000;

export const parseM3U = (m3uText: string): Channel[] => {
  const parsedChannels: Channel[] = [];
  const lines = m3uText.split(/\r?\n/);
  let currentChannelInfo: Partial<Channel> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    if (trimmedLine.startsWith('#EXTINF:')) {
      currentChannelInfo = {};
      const commaIndex = trimmedLine.lastIndexOf(',');
      if (commaIndex !== -1) {
        currentChannelInfo.name = trimmedLine.substring(commaIndex + 1).trim();
        const attributesPart = trimmedLine.substring(8, commaIndex);
        const logoMatch = attributesPart.match(/tvg-logo="([^"]*)"/i);
        if (logoMatch && logoMatch[1]) {
          currentChannelInfo.logo = logoMatch[1];
        }
        const groupMatch = attributesPart.match(/group-title="([^"]*)"/i);
        if (groupMatch && groupMatch[1]) {
          currentChannelInfo.group = groupMatch[1];
        }
        const idMatch = attributesPart.match(/tvg-id="([^"]*)"/i);
        if (idMatch && idMatch[1]) {
          currentChannelInfo.id = idMatch[1];
        }
      } else {
        currentChannelInfo.name = trimmedLine.substring(8).trim();
      }
    } else if (currentChannelInfo && trimmedLine && !trimmedLine.startsWith('#')) {
      if (trimmedLine.includes('://')) {
        currentChannelInfo.url = trimmedLine;
        if (!currentChannelInfo.id) {
          currentChannelInfo.id = trimmedLine;
        }
        
        const finalChannel: Channel = {
          id: currentChannelInfo.id,
          url: currentChannelInfo.url,
          name: currentChannelInfo.name || 'Unknown',
          logo: currentChannelInfo.logo || '',
          group: currentChannelInfo.group || 'Default',
        };
        
        parsedChannels.push(finalChannel);
        currentChannelInfo = null;
      }
    }
  }
  
  logger.info(`Parsed ${parsedChannels.length} channels from M3U`);
  return parsedChannels;
};

export const fetchAndParseM3u = async (m3uUrl: string): Promise<M3UResult> => {
  try {
    logger.info(`Fetching M3U from: ${m3uUrl}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    
    const response = await fetch(m3uUrl, {
      signal: controller.signal,
      headers: {
        'Accept': '*/*',
        'User-Agent': 'OrionTV/1.0',
      },
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorMsg = `HTTP ${response.status}: ${response.statusText}`;
      logger.error(`Failed to fetch M3U: ${errorMsg}`);
      return { channels: [], error: errorMsg };
    }
    
    const m3uText = await response.text();
    logger.info(`M3U file size: ${m3uText.length} bytes`);
    
    if (!m3uText || m3uText.trim().length === 0) {
      return { channels: [], error: 'M3U 文件为空' };
    }
    
    if (!m3uText.includes('#EXTM3U') && !m3uText.includes('#EXTINF')) {
      return { channels: [], error: '无效的 M3U 文件格式' };
    }
    
    const channels = parseM3U(m3uText);
    
    if (channels.length === 0) {
      return { channels: [], error: '未解析到任何频道' };
    }
    
    return { channels, error: null };
  } catch (error) {
    let errorMsg = '未知错误';
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        errorMsg = '请求超时，请检查网络连接';
      } else if (error.message.includes('Network request failed')) {
        errorMsg = '网络请求失败，请检查 URL 是否正确';
      } else {
        errorMsg = error.message;
      }
    }
    logger.error(`Error fetching or parsing M3U: ${errorMsg}`, error);
    return { channels: [], error: errorMsg };
  }
};

export const getPlayableUrl = (originalUrl: string | null): string | null => {
  if (!originalUrl) {
    return null;
  }
  // In React Native, we use the proxy for all http streams to avoid potential issues.
  // if (originalUrl.toLowerCase().startsWith('http://')) {
  //   // Use the baseURL from the existing api instance.
  //   if (!api.baseURL) {
  //       console.warn("API base URL is not set. Cannot create proxy URL.")
  //       return originalUrl; // Fallback to original URL
  //   }
  //   return `${api.baseURL}/proxy?url=${encodeURIComponent(originalUrl)}`;
  // }
  // HTTPS streams can be played directly.
  return originalUrl;
};

import { create } from "zustand";
import { SettingsManager } from "@/services/storage";
import { api, ServerConfig } from "@/services/api";
import { storageConfig } from "@/services/storageConfig";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Logger from "@/utils/Logger";

const logger = Logger.withTag('SettingsStore');
const DEFAULT_API_BASE_URL = "https://any.lumi210.ggff.net";

const normalizeApiBaseUrl = (url: string): string => {
  const trimmed = url.trim();
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
};

interface SettingsState {
  apiBaseUrl: string;
  remoteInputEnabled: boolean;
  videoSource: {
    enabledAll: boolean;
    sources: {
      [key: string]: boolean;
    };
  };
  isModalVisible: boolean;
  serverConfig: ServerConfig | null;
  isLoadingServerConfig: boolean;
  loadSettings: () => Promise<void>;
  fetchServerConfig: () => Promise<void>;
  setApiBaseUrl: (url: string) => void;
  setRemoteInputEnabled: (enabled: boolean) => void;
  saveSettings: () => Promise<void>;
  setVideoSource: (config: { enabledAll: boolean; sources: { [key: string]: boolean } }) => void;
  showModal: () => void;
  hideModal: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  apiBaseUrl: DEFAULT_API_BASE_URL,
  remoteInputEnabled: false,
  isModalVisible: false,
  serverConfig: null,
  isLoadingServerConfig: false,
  videoSource: {
    enabledAll: true,
    sources: {},
  },
  loadSettings: async () => {
    const settings = await SettingsManager.get();
    const savedApiBaseUrl = settings.apiBaseUrl || DEFAULT_API_BASE_URL;
    const processedApiBaseUrl = normalizeApiBaseUrl(savedApiBaseUrl);

    set({
      apiBaseUrl: processedApiBaseUrl,
      remoteInputEnabled: settings.remoteInputEnabled || false,
      videoSource: settings.videoSource || {
        enabledAll: true,
        sources: {},
      },
    });
    api.setBaseUrl(processedApiBaseUrl);
    await get().fetchServerConfig();
  },
  fetchServerConfig: async () => {
    set({ isLoadingServerConfig: true });
    try {
      const config = await api.getServerConfig();
      if (config) {
        storageConfig.setStorageType(config.StorageType);
        set({ serverConfig: config });
      }
    } catch (error) {
      set({ serverConfig: null });
      logger.error("Failed to fetch server config:", error);
    } finally {
      set({ isLoadingServerConfig: false });
    }
  },
  setApiBaseUrl: (url: string) => {
    const nextApiBaseUrl = normalizeApiBaseUrl(url || DEFAULT_API_BASE_URL);
    set({ apiBaseUrl: nextApiBaseUrl });
    api.setBaseUrl(nextApiBaseUrl);
  },
  setRemoteInputEnabled: (enabled: boolean) => set({ remoteInputEnabled: enabled }),
  setVideoSource: (config) => set({ videoSource: config }),
  saveSettings: async () => {
    const { apiBaseUrl, remoteInputEnabled, videoSource } = get();
    const currentSettings = await SettingsManager.get();
    const currentApiBaseUrl = currentSettings.apiBaseUrl;
    const processedApiBaseUrl = normalizeApiBaseUrl(apiBaseUrl || DEFAULT_API_BASE_URL);

    await SettingsManager.save({
      apiBaseUrl: processedApiBaseUrl,
      remoteInputEnabled,
      videoSource,
    });
    if (currentApiBaseUrl !== processedApiBaseUrl) {
      await AsyncStorage.setItem('authCookies', '');
    }
    api.setBaseUrl(processedApiBaseUrl);
    set({ isModalVisible: false, apiBaseUrl: processedApiBaseUrl });
  },
  showModal: () => set({ isModalVisible: true }),
  hideModal: () => set({ isModalVisible: false }),
}));

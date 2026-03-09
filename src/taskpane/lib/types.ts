import type Anthropic from '@anthropic-ai/sdk';

// ─── API Provider 配置 ────────────────────────────────────────────────────────
export type ApiProviderType = 'anthropic' | 'custom';

export interface ApiProviderConfig {
  type: ApiProviderType;
  apiKey: string;
  // 自定义模式
  baseUrl?: string;       // e.g. "https://open.bigmodel.cn/api/paas/v4"
  modelName?: string;     // e.g. "glm-4-flash"
  providerName?: string;  // 显示名称，e.g. "智谱 GLM"
  // 通用
  systemPrompt?: string;  // 自定义 system prompt（覆盖默认值）
}

export interface PresetProvider {
  id: string;
  name: string;
  baseUrl: string;
  defaultModel: string;
  apiKeyPlaceholder: string;
  apiKeyHint?: string;
}

// File attachment for UI tracking (images and documents)
export interface ImageAttachment {
  id: string;
  type: 'base64' | 'url';
  data: string; // base64 data (without prefix) or URL
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | 'application/pdf';
  previewUrl?: string; // data URL for UI preview (images only)
  name?: string;
  fileType: 'image' | 'document';
}

// Content blocks matching Anthropic's API format
export interface TextContent {
  type: 'text';
  text: string;
}

export interface ImageContent {
  type: 'image';
  source: {
    type: 'base64' | 'url';
    media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    data?: string; // for base64
    url?: string; // for url
  };
}

export interface DocumentContent {
  type: 'document';
  source: {
    type: 'base64';
    media_type: 'application/pdf';
    data: string;
  };
}

export type MessageContent = string | Array<TextContent | ImageContent | DocumentContent>;

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: MessageContent;
  attachments?: ImageAttachment[]; // For UI state tracking
  isStreaming?: boolean;
  isAnimating?: boolean;
}

export interface ExcelTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export type AnthropicTool = Anthropic.Tool;

export interface ToolExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
}

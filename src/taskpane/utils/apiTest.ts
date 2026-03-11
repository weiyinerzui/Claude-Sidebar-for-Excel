import Anthropic from '@anthropic-ai/sdk';
import type { ApiProviderConfig } from '../lib/types';

/**
 * API 连接测试结果
 */
export interface ApiTestResult {
  success: boolean;
  message: string;
  latency?: number;
}

/**
 * 测试超时时间（毫秒）
 */
const TEST_TIMEOUT_MS = 15000;

/**
 * 测试 API 连接
 * 根据 provider 类型调用不同的测试方法
 */
export async function testApiConnection(config: ApiProviderConfig): Promise<ApiTestResult> {
  if (config.type === 'anthropic') {
    return testAnthropicConnection(config.apiKey);
  } else {
    return testOpenAIConnection(config);
  }
}

/**
 * 测试 Anthropic API 连接
 */
async function testAnthropicConnection(apiKey: string): Promise<ApiTestResult> {
  const startTime = Date.now();

  try {
    const anthropic = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: true,
    });

    // 使用最小化参数发送测试请求
    const response = await Promise.race([
      anthropic.messages.create({
        model: 'claude-3-5-haiku-latest',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('请求超时')), TEST_TIMEOUT_MS)
      ),
    ]);

    const latency = Date.now() - startTime;

    // 检查响应是否有效
    if (response && response.content) {
      return {
        success: true,
        message: `连接成功 (${latency}ms)`,
        latency,
      };
    }

    return {
      success: false,
      message: '响应格式异常',
    };
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * 测试 OpenAI 兼容 API 连接
 */
async function testOpenAIConnection(config: ApiProviderConfig): Promise<ApiTestResult> {
  const startTime = Date.now();

  const baseUrl = config.baseUrl?.replace(/\/$/, '') ?? '';
  const model = config.modelName ?? 'gpt-4o-mini';

  if (!baseUrl) {
    return {
      success: false,
      message: '请输入 Base URL',
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latency = Date.now() - startTime;

    if (response.ok) {
      return {
        success: true,
        message: `连接成功 (${latency}ms)`,
        latency,
      };
    }

    // 处理错误响应
    const errorData = await response.json().catch(() => null);
    const errorMessage = errorData?.error?.message || getHttpErrorMessage(response.status);

    return {
      success: false,
      message: errorMessage,
    };
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * 处理 API 错误
 */
function handleApiError(error: unknown): ApiTestResult {
  if (error instanceof Error) {
    // 超时错误
    if (error.name === 'AbortError' || error.message.includes('abort')) {
      return {
        success: false,
        message: '连接超时，请检查网络或 Base URL',
      };
    }

    // 网络错误
    if (error.message.includes('fetch') || error.message.includes('network')) {
      return {
        success: false,
        message: '网络错误，请检查 Base URL 是否正确',
      };
    }

    // Anthropic API 错误
    if (error.message.includes('API key')) {
      return {
        success: false,
        message: 'API Key 无效',
      };
    }

    if (error.message.includes('rate limit')) {
      return {
        success: false,
        message: '请求频率超限，请稍后重试',
      };
    }

    return {
      success: false,
      message: error.message,
    };
  }

  return {
    success: false,
    message: '未知错误',
  };
}

/**
 * 获取 HTTP 状态码对应的错误消息
 */
function getHttpErrorMessage(status: number): string {
  switch (status) {
    case 401:
      return 'API Key 无效或已过期';
    case 403:
      return '无权限访问此 API';
    case 404:
      return 'API 端点不存在，请检查 Base URL';
    case 429:
      return '请求频率超限，请稍后重试';
    case 500:
    case 502:
    case 503:
      return '服务器错误，请稍后重试';
    default:
      return `请求失败 (${status})`;
  }
}
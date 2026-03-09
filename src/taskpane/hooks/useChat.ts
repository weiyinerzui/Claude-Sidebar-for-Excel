import type { ApiProviderConfig } from '../lib/types';
import { useClaudeChat } from './useClaudeChat';
import { useOpenAIChat } from './useOpenAIChat';

/**
 * 统一 chat hook：根据 config.type 自动分发到 Anthropic SDK 或 OpenAI 兼容实现
 */
export function useChat(config: ApiProviderConfig) {
    // React hooks 规则要求无条件调用，所以两个都初始化，根据 type 选择返回值
    const claude = useClaudeChat(config);
    const openai = useOpenAIChat(config);

    return config.type === 'anthropic' ? claude : openai;
}

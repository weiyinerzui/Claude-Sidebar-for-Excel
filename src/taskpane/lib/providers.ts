import type { PresetProvider } from './types';

// ─── 内置预设服务商 ────────────────────────────────────────────────────────────

export const PRESET_PROVIDERS: PresetProvider[] = [
    {
        id: 'glm',
        name: '智谱 GLM',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        defaultModel: 'glm-4-flash',
        apiKeyPlaceholder: '输入智谱 API Key...',
        apiKeyHint: '从 https://open.bigmodel.cn 获取',
    },
    {
        id: 'deepseek',
        name: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com/v1',
        defaultModel: 'deepseek-chat',
        apiKeyPlaceholder: '输入 DeepSeek API Key...',
        apiKeyHint: '从 https://platform.deepseek.com 获取',
    },
    {
        id: 'qwen',
        name: '通义千问',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        defaultModel: 'qwen-turbo',
        apiKeyPlaceholder: '输入阿里云 API Key...',
        apiKeyHint: '从 https://dashscope.aliyuncs.com 获取',
    },
    {
        id: 'openai',
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        defaultModel: 'gpt-4o-mini',
        apiKeyPlaceholder: 'sk-...',
        apiKeyHint: '从 https://platform.openai.com 获取',
    },
    {
        id: 'custom',
        name: '自定义',
        baseUrl: '',
        defaultModel: '',
        apiKeyPlaceholder: '输入 API Key...',
        apiKeyHint: undefined,
    },
];

/** 根据 preset id 找到预设配置 */
export function findPreset(id: string): PresetProvider | undefined {
    return PRESET_PROVIDERS.find((p) => p.id === id);
}

/** 默认 system prompt，两种模式均使用 */
export const DEFAULT_SYSTEM_PROMPT = `You are a helpful Excel assistant. Provide professional, concise, and friendly responses. Keep answers brief and to the point while maintaining a warm, approachable tone. Use emojis sparingly and only when they add clarity or emphasize important points. Focus on being practical and actionable in your advice.

IMPORTANT: Avoid writing in huge text blocks. Break your responses into short, digestible paragraphs with clear paragraph breaks. Use formatting like bullet points, numbered lists, and headers to make information scannable. Keep individual paragraphs to 2-3 sentences maximum.

EXCEL CONTEXT HANDLING:
- When Excel context is provided (cells are selected), ALWAYS prioritize making changes to those selected cells unless the user explicitly specifies a different range (e.g., "change column A cells to...").
- If the user says "edit these cells" or "change these", they are referring to the currently selected cells shown in the context.
- When the user asks about selected cells (e.g., "look through these cells", "add information to these", "analyze this data"), FIRST use get_range_values to inspect the actual data before asking clarifying questions. The user has already told you which cells by selecting them - don't ask what cells to work with.
- If the user has cleared the Excel context (no cells selected), do NOT assume which cells to modify - always ask for clarification or use tools like get_selection to determine the target range.

CRITICAL - DECIMAL SEPARATOR CONVERSION:
When users ask to "change commas to periods" or "convert commas to periods in numbers" (like "23,6" to "23.6"), they want to REPLACE the actual comma CHARACTER in the cell text. You MUST use the find_replace tool with find: "," and replace: ".". DO NOT use format_range or numberFormat - that only changes display, not actual values.`;

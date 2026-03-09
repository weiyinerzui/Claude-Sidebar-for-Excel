import { useState, useCallback } from 'react';
import type { ChatMessage, ImageAttachment, ApiProviderConfig } from '../lib/types';
import type { ExcelContext } from './useExcelContext';
import { useExcelTools } from './useExcelTools';
import type { ToolCall } from '../components/ToolCallIndicator';
import { DEFAULT_SYSTEM_PROMPT } from '../lib/providers';

/**
 * 将 Excel tools（Anthropic 格式）转换为 OpenAI function calling 格式
 */
function toOpenAITools(tools: any[]): any[] {
    return tools.map((t) => ({
        type: 'function',
        function: {
            name: t.name,
            description: t.description,
            parameters: t.input_schema,
        },
    }));
}

/**
 * 解析 SSE 流，逐行 yield data 字符串
 */
async function* readSSEStream(reader: ReadableStreamDefaultReader<Uint8Array>) {
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data:')) {
                const data = trimmed.slice(5).trim();
                if (data && data !== '[DONE]') yield data;
            }
        }
    }
}

/**
 * 调用 OpenAI 兼容 API（流式）
 */
async function* callOpenAIStream(
    baseUrl: string,
    apiKey: string,
    body: object,
    signal: AbortSignal
): AsyncGenerator<string> {
    const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ ...body, stream: true }),
        signal,
    });

    if (!response.ok) {
        let errMsg = `HTTP ${response.status}`;
        try {
            const errJson = await response.json();
            errMsg = errJson?.error?.message ?? errMsg;
        } catch {
            // ignore
        }
        throw new Error(errMsg);
    }

    const reader = response.body!.getReader();
    yield* readSSEStream(reader);
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useOpenAIChat(config: ApiProviderConfig) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [activeToolCalls, setActiveToolCalls] = useState<ToolCall[]>([]);
    const [abortController, setAbortController] = useState<AbortController | null>(null);
    const { tools, executeTool } = useExcelTools();

    const systemPrompt = config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    const baseUrl = config.baseUrl ?? '';
    const modelName = config.modelName ?? 'gpt-4o-mini';
    const openAITools = toOpenAITools(tools as any[]);

    const sendMessage = useCallback(
        async (content: string, excelContext?: ExcelContext, attachments?: ImageAttachment[]) => {
            if ((!content.trim() && !attachments?.length) || isLoading) return;

            // Build text content
            let textContent = content.trim();
            if (excelContext?.hasData) {
                textContent += `\n\n[Excel Context: Currently viewing ${excelContext.address} on sheet "${excelContext.sheetName}" (${excelContext.rowCount}×${excelContext.columnCount} cells)]`;
            }

            // OpenAI 格式的 content
            let msgContent: any;
            if (attachments && attachments.length > 0) {
                const parts: any[] = [];
                if (textContent) parts.push({ type: 'text', text: textContent });
                for (const att of attachments) {
                    if (att.fileType === 'image') {
                        parts.push({
                            type: 'image_url',
                            image_url: {
                                url:
                                    att.type === 'base64'
                                        ? `data:${att.mediaType};base64,${att.data}`
                                        : att.data,
                            },
                        });
                    }
                    // PDF 附件 OpenAI 兼容 API 通常不支持，跳过
                }
                msgContent = parts;
            } else {
                msgContent = textContent || content.trim();
            }

            const userMessage: ChatMessage = {
                id: crypto.randomUUID(),
                role: 'user',
                content: msgContent,
                attachments,
            };

            setMessages((prev) => [...prev, userMessage]);
            setIsLoading(true);

            const controller = new AbortController();
            setAbortController(controller);

            // 构建对话历史（OpenAI 格式）
            const history: any[] = [...messages, userMessage].map((m) => ({
                role: m.role,
                content: m.content,
            }));

            const streamingMessageId = crypto.randomUUID();
            let messageCreated = false;
            let fullText = '';

            try {
                // ── 第一轮请求 ──
                let done = false;
                let pendingToolCalls: any[] = [];

                while (!done) {
                    const requestBody: any = {
                        model: modelName,
                        messages: [{ role: 'system', content: systemPrompt }, ...history],
                        tools: openAITools,
                        tool_choice: 'auto',
                    };

                    pendingToolCalls = [];
                    let toolCallAccumulators: Record<string, any> = {};

                    for await (const raw of callOpenAIStream(baseUrl, config.apiKey, requestBody, controller.signal)) {
                        let chunk: any;
                        try {
                            chunk = JSON.parse(raw);
                        } catch {
                            continue;
                        }

                        const choice = chunk.choices?.[0];
                        if (!choice) continue;

                        const delta = choice.delta ?? {};

                        // 文本增量
                        if (delta.content) {
                            fullText += delta.content;
                            if (!messageCreated) {
                                setMessages((prev) => [
                                    ...prev,
                                    { id: streamingMessageId, role: 'assistant', content: fullText, isStreaming: true, isAnimating: true },
                                ]);
                                messageCreated = true;
                            } else {
                                setMessages((prev) =>
                                    prev.map((m) => (m.id === streamingMessageId ? { ...m, content: fullText } : m))
                                );
                            }
                        }

                        // Tool calls 增量（OpenAI 流式拼接）
                        if (delta.tool_calls) {
                            for (const tc of delta.tool_calls) {
                                const idx = tc.index ?? 0;
                                if (!toolCallAccumulators[idx]) {
                                    toolCallAccumulators[idx] = { id: '', type: 'function', function: { name: '', arguments: '' } };
                                }
                                if (tc.id) toolCallAccumulators[idx].id = tc.id;
                                if (tc.function?.name) toolCallAccumulators[idx].function.name += tc.function.name;
                                if (tc.function?.arguments) toolCallAccumulators[idx].function.arguments += tc.function.arguments;
                            }
                        }

                        if (choice.finish_reason === 'tool_calls') {
                            pendingToolCalls = Object.values(toolCallAccumulators);
                        }

                        if (choice.finish_reason && choice.finish_reason !== 'tool_calls') {
                            done = true;
                        }
                    }

                    // 有 tool calls 需要执行
                    if (pendingToolCalls.length > 0) {
                        // 将 assistant 消息（含 tool_calls）加入历史
                        history.push({
                            role: 'assistant',
                            content: fullText || null,
                            tool_calls: pendingToolCalls,
                        });

                        // 显示 tool call 指示器
                        const newToolCalls: ToolCall[] = pendingToolCalls.map((tc) => ({
                            id: tc.id,
                            name: tc.function.name,
                            status: 'running' as const,
                        }));
                        setActiveToolCalls(newToolCalls);

                        // 执行所有 tools
                        const toolResults = await Promise.all(
                            pendingToolCalls.map(async (tc) => {
                                let args: any = {};
                                try { args = JSON.parse(tc.function.arguments); } catch { /* ignore */ }
                                const result = await executeTool(tc.function.name, args);
                                return {
                                    role: 'tool' as const,
                                    tool_call_id: tc.id,
                                    content: JSON.stringify(result),
                                };
                            })
                        );

                        setActiveToolCalls([]);
                        history.push(...toolResults);
                        // 继续下一轮
                    } else {
                        done = true;
                    }
                }

                // 标记完成
                if (messageCreated) {
                    setMessages((prev) =>
                        prev.map((m) => (m.id === streamingMessageId ? { ...m, isStreaming: false, isAnimating: false } : m))
                    );
                }

                // 清理附件
                if (attachments?.length) {
                    setMessages((prev) =>
                        prev.map((m) => {
                            if (m.id === userMessage.id) {
                                const text =
                                    typeof m.content === 'string'
                                        ? m.content
                                        : (m.content as any[]).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
                                return { ...m, content: text, attachments: undefined };
                            }
                            return m;
                        })
                    );
                }
            } catch (error: any) {
                console.error('OpenAI chat error:', error);
                if (error.name === 'AbortError' || controller.signal.aborted) {
                    setMessages((prev) =>
                        prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false, isAnimating: false } : m))
                    );
                    setMessages((prev) => [
                        ...prev,
                        { id: crypto.randomUUID(), role: 'assistant', content: 'Response stopped by user.' },
                    ]);
                } else {
                    setMessages((prev) => [
                        ...prev,
                        {
                            id: crypto.randomUUID(),
                            role: 'assistant',
                            content: `I encountered an error: ${error.message || 'Unknown error'}. Please check your API key and Base URL.`,
                        },
                    ]);
                }
            } finally {
                setIsLoading(false);
                setActiveToolCalls([]);
                setAbortController(null);
            }
        },
        [messages, config, executeTool, tools, isLoading, systemPrompt, baseUrl, modelName, openAITools]
    );

    const clearMessages = useCallback(() => setMessages([]), []);

    const stopGeneration = useCallback(() => {
        if (abortController) {
            abortController.abort();
            setAbortController(null);
        }
    }, [abortController]);

    const regenerateMessage = useCallback(
        async (messageId: string) => {
            const idx = messages.findIndex((m) => m.id === messageId);
            if (idx === -1 || idx === 0) return;
            const kept = messages.slice(0, idx);
            setMessages(kept);
            const lastUser = [...kept].reverse().find((m) => m.role === 'user');
            if (lastUser) await sendMessage(lastUser.content as string);
        },
        [messages, sendMessage]
    );

    return { messages, isLoading, activeToolCalls, sendMessage, clearMessages, regenerateMessage, stopGeneration };
}

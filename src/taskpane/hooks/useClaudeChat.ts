import { useState, useCallback } from 'react';
import Anthropic from '@anthropic-ai/sdk';
import type { ChatMessage, ImageAttachment, TextContent, ImageContent, DocumentContent, ApiProviderConfig } from '../lib/types';
import type { ExcelContext } from './useExcelContext';
import { useExcelTools } from './useExcelTools';
import type { ToolCall } from '../components/ToolCallIndicator';
import { DEFAULT_SYSTEM_PROMPT } from '../lib/providers';

export function useClaudeChat(config: ApiProviderConfig) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeToolCalls, setActiveToolCalls] = useState<ToolCall[]>([]);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const { tools, executeTool } = useExcelTools();
  const systemPrompt = config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;

  const sendMessage = useCallback(
    async (content: string, excelContext?: ExcelContext, attachments?: ImageAttachment[]) => {
      if ((!content.trim() && !attachments?.length) || isLoading) return;

      // Build message content (text + images/documents if provided)
      let messageContent: string | Array<TextContent | ImageContent | DocumentContent>;
      let enhancedTextContent = content.trim();

      // Enhance with Excel context if available
      if (excelContext && excelContext.hasData) {
        const contextInfo = `\n\n[Excel Context: Currently viewing ${excelContext.address} on sheet "${excelContext.sheetName}" (${excelContext.rowCount}×${excelContext.columnCount} cells)]`;
        enhancedTextContent += contextInfo;
      }

      // If we have attachments, build content blocks array
      if (attachments && attachments.length > 0) {
        const contentBlocks: Array<TextContent | ImageContent | DocumentContent> = [];

        // Add text content first (if there is any)
        if (enhancedTextContent) {
          contentBlocks.push({
            type: 'text',
            text: enhancedTextContent,
          });
        }

        // Add file content blocks (images or documents)
        for (const attachment of attachments) {
          if (attachment.fileType === 'document') {
            // PDF document
            contentBlocks.push({
              type: 'document',
              source: {
                type: 'base64',
                media_type: attachment.mediaType as 'application/pdf',
                data: attachment.data,
              },
            });
          } else {
            // Image
            contentBlocks.push({
              type: 'image',
              source: {
                type: attachment.type,
                media_type: attachment.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                ...(attachment.type === 'base64'
                  ? { data: attachment.data }
                  : { url: attachment.data }),
              },
            });
          }
        }

        messageContent = contentBlocks;
      } else {
        // No attachments, just text
        messageContent = content.trim();
      }

      // Add user message (show original content to user, but send enhanced to Claude)
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: messageContent,
        attachments,
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      // Create new abort controller for this request
      const controller = new AbortController();
      setAbortController(controller);

      try {
        const anthropic = new Anthropic({
          apiKey: config.apiKey,
          dangerouslyAllowBrowser: true,
        });

        // Prepare conversation history for Claude
        const conversationMessages: Anthropic.MessageParam[] = [...messages, userMessage].map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        } as Anthropic.MessageParam));

        // Generate ID for streaming message but don't create it yet
        const streamingMessageId = crypto.randomUUID();
        let messageCreated = false;

        // Start streaming
        const stream = anthropic.messages.stream(
          {
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 4096,
            system: systemPrompt,
            tools: tools as Anthropic.Tool[],
            messages: conversationMessages.map(m => ({
              role: m.role,
              content: m.content,
            })) as Anthropic.MessageParam[],
          },
          { signal: controller.signal }
        );

        // Handle stream events
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            const textDelta = event.delta as Anthropic.TextDelta;
            // Create the message on first text delta
            if (!messageCreated) {
              setMessages((prev) => [
                ...prev,
                {
                  id: streamingMessageId,
                  role: 'assistant',
                  content: textDelta.text,
                  isStreaming: true,
                  isAnimating: true,
                },
              ]);
              messageCreated = true;
            } else {
              // Update existing message
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamingMessageId ? { ...m, content: m.content + textDelta.text } : m
                )
              );
            }
          }
        }

        let response = await stream.finalMessage();
        let fullTextContent = '';

        // Collect any text content from initial response
        for (const block of response.content) {
          if (block.type === 'text') {
            fullTextContent += block.text;
          }
        }

        // Handle tool use if needed
        while (response.stop_reason === 'tool_use') {
          // Find all tool_use blocks in the response
          const toolUseBlocks = response.content.filter(
            (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
          );

          if (toolUseBlocks.length === 0) break;

          // Add assistant message with tool_use to conversation history
          conversationMessages.push({
            role: 'assistant',
            content: response.content as Anthropic.ContentBlock[],
          });

          // Add active tool calls to state
          const newToolCalls: ToolCall[] = toolUseBlocks.map((block) => ({
            id: block.id,
            name: block.name,
            status: 'running' as const,
          }));
          setActiveToolCalls(newToolCalls);

          // Execute all tools and collect results
          const toolResults = await Promise.all(
            toolUseBlocks.map(async (toolUseBlock) => {
              const result = await executeTool(toolUseBlock.name, toolUseBlock.input as Record<string, unknown>);
              return {
                type: 'tool_result' as const,
                tool_use_id: toolUseBlock.id,
                content: JSON.stringify(result),
              };
            })
          );

          // Clear active tool calls after execution
          setActiveToolCalls([]);

          // Add tool results as user message
          conversationMessages.push({
            role: 'user',
            content: toolResults as Anthropic.ToolResultBlockParam[],
          });

          // Continue streaming with tool results
          const continueStream = anthropic.messages.stream(
            {
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 4096,
              system: systemPrompt,
              tools: tools as Anthropic.Tool[],
              messages: conversationMessages.map(m => ({
                role: m.role,
                content: m.content,
              })) as Anthropic.MessageParam[],
              thinking: {
                type: 'enabled',
                budget_tokens: 2000,
              },
            },
            { signal: controller.signal }
          );

          for await (const event of continueStream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              fullTextContent += event.delta.text;

              // Create the message on first text delta if not created yet
              if (!messageCreated) {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: streamingMessageId,
                    role: 'assistant',
                    content: fullTextContent,
                    isStreaming: true,
                    isAnimating: true,
                  },
                ]);
                messageCreated = true;
              } else {
                // Update existing message
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === streamingMessageId ? { ...m, content: fullTextContent } : m
                  )
                );
              }
            }
          }

          response = await continueStream.finalMessage();

          // Collect any additional text content
          for (const block of response.content) {
            if (block.type === 'text') {
              fullTextContent += block.text;

              // Create the message if not created yet
              if (!messageCreated) {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: streamingMessageId,
                    role: 'assistant',
                    content: fullTextContent,
                    isStreaming: true,
                    isAnimating: true,
                  },
                ]);
                messageCreated = true;
              } else {
                // Update existing message
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === streamingMessageId ? { ...m, content: fullTextContent } : m
                  )
                );
              }
            }
          }
        }

        // Mark streaming as complete (only if message was created)
        if (messageCreated) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamingMessageId ? { ...m, isStreaming: false, isAnimating: false } : m
            )
          );
        }

        // Remove image attachments from user message after successful analysis
        // This discards temporary images after Claude has extracted the data
        if (attachments && attachments.length > 0) {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id === userMessage.id) {
                // Convert content back to string if it was an array
                const textContent =
                  typeof m.content === 'string'
                    ? m.content
                    : m.content.filter((block) => block.type === 'text').map((block) => block.text).join('\n');

                return {
                  ...m,
                  content: textContent,
                  attachments: undefined, // Remove attachments
                };
              }
              return m;
            })
          );
        }
      } catch (error: any) {
        console.error('Chat error:', error);

        // Check if it was aborted
        if (error.name === 'AbortError' || controller.signal.aborted) {
          // Clean up any streaming message
          setMessages((prev) =>
            prev.map((m) =>
              m.isStreaming ? { ...m, isStreaming: false, isAnimating: false } : m
            )
          );

          // Add aborted message
          const abortedMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: 'Response stopped by user.',
          };
          setMessages((prev) => [...prev, abortedMessage]);
        } else {
          // Add error message
          const errorMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `I encountered an error: ${error.message || 'Unknown error'}. Please try again.`,
          };

          setMessages((prev) => [...prev, errorMessage]);
        }
      } finally {
        setIsLoading(false);
        setActiveToolCalls([]);
        setAbortController(null);
      }
    },
    [messages, config, executeTool, tools, isLoading, systemPrompt]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const stopGeneration = useCallback(() => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
  }, [abortController]);

  const regenerateMessage = useCallback(
    async (messageId: string) => {
      // Find the message index
      const messageIndex = messages.findIndex((m) => m.id === messageId);
      if (messageIndex === -1 || messageIndex === 0) return;

      // Remove messages from this point onwards
      const messagesToKeep = messages.slice(0, messageIndex);
      setMessages(messagesToKeep);

      // Find the last user message
      const lastUserMessage = [...messagesToKeep].reverse().find((m) => m.role === 'user');
      if (lastUserMessage) {
        // Resend the message
        await sendMessage(lastUserMessage.content as string);
      }
    },
    [messages, sendMessage]
  );

  return {
    messages,
    isLoading,
    activeToolCalls,
    sendMessage,
    clearMessages,
    regenerateMessage,
    stopGeneration,
  };
}

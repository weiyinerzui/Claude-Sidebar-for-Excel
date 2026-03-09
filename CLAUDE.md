# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Install dependencies
npm install

# Generate SSL certificate (required for Office Add-ins)
npx office-addin-dev-certs install

# Start development server with HMR at https://localhost:3000
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Validate Office Add-in manifest
npm run validate

# Debug in Excel (opens Excel with add-in sideloaded)
npm start

# Stop debugging session
npm stop
```

## Architecture Overview

### Dual Provider System

The add-in supports two AI provider modes via `ApiProviderConfig`:

1. **Anthropic (`type: 'anthropic'`)**: Uses the `@anthropic-ai/sdk` directly with streaming responses, extended thinking, and tool calling. See `useClaudeChat.ts`.

2. **Custom/OpenAI-compatible (`type: 'custom'`)**: Uses fetch-based SSE streaming to any OpenAI-compatible API endpoint. Supports preset providers (GLM, DeepSeek, Qwen, OpenAI) or custom base URLs. See `useOpenAIChat.ts`.

The `useChat.ts` hook dispatches to the appropriate implementation based on `config.type`.

### Key Architectural Patterns

- **Excel Context Integration**: `useExcelContext.ts` tracks selected cells with aggressive limits (100 cells for full load, 50k max) to prevent crashes. Selection changes trigger context updates via Office.js events.

- **Tool System**: `useExcelTools.ts` implements 30+ Excel operations as function tools that the AI can call. Tools are defined in `excel-tools.ts` using Anthropic's tool schema format. The OpenAI hook converts these to OpenAI function calling format via `toOpenAITools()`.

- **Streaming Chat**: Both providers support streaming text output with abort capability. Tool calls pause streaming, execute synchronously via `Excel.run()`, then resume.

- **API Key Storage**: Keys are persisted in `Office.context.document.settings` (per-document storage), not localStorage. This is an Office Add-in security requirement.

### Entry Points

- `src/taskpane/index.tsx` - Main React entry point
- `src/taskpane/App.tsx` - Root component, handles config loading/saving
- `src/commands.html` - Ribbon button handlers (minimal, just taskpane commands)

### Component Hierarchy

```
App.tsx
├── ApiKeySetup.tsx (shown when no config)
└── ChatInterface.tsx
    ├── ExcelContext.tsx (shows selected cell info)
    ├── SuggestionChips.tsx (context-aware suggestions)
    ├── MessageList (with Message.tsx components)
    ├── ToolCallIndicator.tsx (shows active tool executions)
    ├── MessageInput.tsx (with CommandPalette.tsx integration)
    ├── ToolsMenu.tsx (quick Excel actions via ⋮ menu)
    └── Settings.tsx (provider configuration)
```

## Office Add-in Specifics

### HTTPS Requirement
Office Add-ins require HTTPS in development. The Vite config reads certificates from `~/.office-addin-dev-certs/`. Run `npx office-addin-dev-certs install` before first use.

### Manifest (`manifest.xml`)
- Defines the add-in's identity, permissions (`ReadWriteDocument`), and UI integration
- Points to `https://localhost:3000/taskpane/index.html` for the taskpane
- Includes buttons in the Home ribbon tab

### Excel.js API
All Excel operations use `Excel.run(async (context) => {...})` pattern. The context must be synced with `await context.sync()` after loading properties or making changes.

### Performance Limits in `useExcelContext.ts`
```typescript
MAX_CELLS_FOR_FULL_LOAD = 100    // Load values/formulas
MAX_CELLS_FOR_PREVIEW = 50000    // Load preview only
```

## Excel Tools Available

30+ tools in `excel-tools.ts` including:
- Data: `read_range`, `write_range`, `get_selection`, `get_workbook_info`
- Formatting: `format_range`, `apply_borders`, `set_alignment`
- Structure: `create_table`, `insert_rows`, `delete_rows`, `manage_worksheet`
- Charts: `create_chart`, `add_sparkline`
- Analysis: `calculate_statistics`, `generate_expense_summary`, `check_duplicates`
- Data Ops: `sort_range`, `remove_duplicates`, `transpose_range`, `find_replace`
- And more...

## Command Palette

18 slash commands defined in `commands.ts` (e.g., `/analyze`, `/formula`, `/chart`). Accessible by typing `/` in the message input. Commands insert template text, not direct actions.

## Preset Providers

Configured in `providers.ts`:
- GLM (智谱): `https://open.bigmodel.cn/api/paas/v4`
- DeepSeek: `https://api.deepseek.com/v1`
- Qwen (通义千问): `https://dashscope.aliyuncs.com/compatible-mode/v1`
- OpenAI: `https://api.openai.com/v1`

## Styling

- Uses Fluent UI React Components (`@fluentui/react-components`)
- CSS modules organized by component in `src/taskpane/styles/`
- Design tokens in `design-tokens.css`

## Troubleshooting

**Certificate issues**: Run `npx office-addin-dev-certs install --force`

**Add-in not loading**: Clear Office cache:
- macOS: `~/Library/Containers/com.microsoft.Excel/Data/Documents/wef`
- Windows: `%LOCALAPPDATA%\Microsoft\Office\16.0\Wef`

**Context not capturing**: Selection must be made before sending message. Check console (F12 in Excel) for errors.
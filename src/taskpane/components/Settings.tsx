import { useState } from 'react';
import { Dismiss24Regular, CheckmarkCircle16Regular, DismissCircle16Regular, SpinnerIos16Regular } from '@fluentui/react-icons';
import { isMac } from '../hooks/useKeyboardShortcuts';
import type { ApiProviderConfig } from '../lib/types';
import { PRESET_PROVIDERS, DEFAULT_SYSTEM_PROMPT } from '../lib/providers';
import { testApiConnection } from '../utils/apiTest';
import '../styles/settings.css';

interface SettingsProps {
  open: boolean;
  onClose: () => void;
  config: ApiProviderConfig;
  onConfigChange: (config: ApiProviderConfig) => void;
}

export default function Settings({ open, onClose, config, onConfigChange }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<'shortcuts' | 'settings' | 'about'>('shortcuts');
  const [localConfig, setLocalConfig] = useState<ApiProviderConfig>({ ...config });
  const [showApiKey, setShowApiKey] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState<string>('');

  // 当 open 状态从 false->true 时同步最新 config
  const [prevOpen, setPrevOpen] = useState(false);
  if (open && !prevOpen) {
    setLocalConfig({ ...config });
    setPrevOpen(true);
  }
  if (!open && prevOpen) {
    setPrevOpen(false);
  }

  if (!open) return null;

  const handleSave = () => {
    onConfigChange(localConfig);
    onClose();
  };

  /** 测试 API 连接 */
  const handleTestConnection = async () => {
    if (!localConfig.apiKey.trim()) return;

    // Custom 模式需要 Base URL
    if (localConfig.type === 'custom' && !localConfig.baseUrl?.trim()) {
      setTestStatus('error');
      setTestMessage('请输入 Base URL');
      setTimeout(() => {
        setTestStatus('idle');
        setTestMessage('');
      }, 3000);
      return;
    }

    setTestStatus('testing');
    setTestMessage('');

    const result = await testApiConnection(localConfig);

    setTestStatus(result.success ? 'success' : 'error');
    setTestMessage(result.message);

    // 3秒后自动重置状态
    setTimeout(() => {
      setTestStatus('idle');
      setTestMessage('');
    }, 3000);
  };

  /** 根据 preset id 更新相关字段 */
  const applyPreset = (presetId: string) => {
    const preset = PRESET_PROVIDERS.find((p) => p.id === presetId);
    if (!preset) return;
    if (presetId === 'custom') {
      setLocalConfig((prev) => ({
        ...prev,
        type: 'custom',
        providerName: '自定义',
        baseUrl: prev.baseUrl ?? '',
        modelName: prev.modelName ?? '',
      }));
    } else {
      setLocalConfig((prev) => ({
        ...prev,
        type: 'custom',
        providerName: preset.name,
        baseUrl: preset.baseUrl,
        modelName: prev.modelName && prev.providerName === preset.name ? prev.modelName : preset.defaultModel,
      }));
    }
  };

  const shortcuts = [
    { keys: isMac() ? '⌘K' : 'Ctrl+K', description: 'Focus message input' },
    { keys: isMac() ? '⌘L' : 'Ctrl+L', description: 'Clear chat history' },
    { keys: isMac() ? '⇧?' : 'Shift+?', description: 'Show keyboard shortcuts' },
    { keys: 'Enter', description: 'Send message' },
    { keys: 'Shift+Enter', description: 'New line' },
    { keys: '/', description: 'Open command palette' },
    { keys: 'Esc', description: 'Clear input or close palette' },
  ];

  /** 判断当前选中的是哪个预设（按 baseUrl 匹配） */
  const activePresetId = (() => {
    if (localConfig.type === 'anthropic') return 'anthropic';
    const match = PRESET_PROVIDERS.find(
      (p) => p.id !== 'custom' && p.baseUrl === localConfig.baseUrl
    );
    return match?.id ?? 'custom';
  })();

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2 className="settings-title">Settings</h2>
          <button
            className="settings-close-button"
            onClick={onClose}
            aria-label="Close settings"
            type="button"
          >
            <Dismiss24Regular />
          </button>
        </div>

        <div className="settings-tabs">
          <button
            className={`settings-tab ${activeTab === 'shortcuts' ? 'active' : ''}`}
            onClick={() => setActiveTab('shortcuts')}
            type="button"
          >
            Shortcuts
          </button>
          <button
            className={`settings-tab ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
            type="button"
          >
            Settings
          </button>
          <button
            className={`settings-tab ${activeTab === 'about' ? 'active' : ''}`}
            onClick={() => setActiveTab('about')}
            type="button"
          >
            About
          </button>
        </div>

        <div className="settings-content">
          {activeTab === 'shortcuts' ? (
            <div className="shortcuts-section">
              <p className="shortcuts-description">
                Use these keyboard shortcuts to work faster
              </p>
              <div className="shortcuts-list">
                {shortcuts.map((shortcut, index) => (
                  <div key={index} className="shortcut-item">
                    <kbd className="shortcut-keys">{shortcut.keys}</kbd>
                    <span className="shortcut-description">{shortcut.description}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : activeTab === 'settings' ? (
            <div className="settings-section">

              {/* ── Provider 选择 ── */}
              <div className="setting-group">
                <label className="setting-label">AI 服务商</label>
                <p className="setting-description">选择使用的 AI 服务商或自定义接口</p>
                <div className="provider-grid">
                  {/* Anthropic 模式 */}
                  <button
                    type="button"
                    className={`provider-card ${localConfig.type === 'anthropic' ? 'active' : ''}`}
                    onClick={() => setLocalConfig((prev) => ({ ...prev, type: 'anthropic' }))}
                  >
                    <span className="provider-icon">🤖</span>
                    <span className="provider-name">Anthropic</span>
                  </button>
                  {/* 预设服务商 */}
                  {PRESET_PROVIDERS.filter((p) => p.id !== 'custom').map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className={`provider-card ${localConfig.type === 'custom' && activePresetId === preset.id ? 'active' : ''}`}
                      onClick={() => applyPreset(preset.id)}
                    >
                      <span className="provider-name">{preset.name}</span>
                    </button>
                  ))}
                  {/* 自定义 */}
                  <button
                    type="button"
                    className={`provider-card ${localConfig.type === 'custom' && activePresetId === 'custom' ? 'active' : ''}`}
                    onClick={() => applyPreset('custom')}
                  >
                    <span className="provider-name">自定义</span>
                  </button>
                </div>
              </div>

              {/* ── API Key ── */}
              <div className="setting-group">
                <label htmlFor="settings-api-key" className="setting-label">API Key</label>
                <p className="setting-description">
                  {localConfig.type === 'anthropic'
                    ? 'Anthropic API Key，以 sk-ant- 开头'
                    : '对应服务商的 API Key'}
                </p>
                <div className="api-key-input-group">
                  <input
                    id="settings-api-key"
                    type={showApiKey ? 'text' : 'password'}
                    className="api-key-input"
                    value={localConfig.apiKey}
                    onChange={(e) => setLocalConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
                    placeholder={
                      localConfig.type === 'anthropic'
                        ? 'sk-ant-...'
                        : PRESET_PROVIDERS.find((p) => p.id === activePresetId)?.apiKeyPlaceholder ?? '输入 API Key...'
                    }
                  />
                  <button
                    className="toggle-visibility-button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    type="button"
                    aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                  >
                    {showApiKey ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {/* ── 自定义模式：Base URL + Model ── */}
              {localConfig.type === 'custom' && (
                <>
                  <div className="setting-group">
                    <label htmlFor="settings-base-url" className="setting-label">Base URL</label>
                    <p className="setting-description">API 接口地址（OpenAI 兼容格式）</p>
                    <input
                      id="settings-base-url"
                      type="text"
                      className="api-key-input"
                      value={localConfig.baseUrl ?? ''}
                      onChange={(e) => setLocalConfig((prev) => ({ ...prev, baseUrl: e.target.value }))}
                      placeholder="https://api.example.com/v1"
                    />
                  </div>

                  <div className="setting-group">
                    <label htmlFor="settings-model" className="setting-label">模型名称</label>
                    <p className="setting-description">要使用的模型标识符</p>
                    <input
                      id="settings-model"
                      type="text"
                      className="api-key-input"
                      value={localConfig.modelName ?? ''}
                      onChange={(e) => setLocalConfig((prev) => ({ ...prev, modelName: e.target.value }))}
                      placeholder={PRESET_PROVIDERS.find((p) => p.id === activePresetId)?.defaultModel ?? 'gpt-4o-mini'}
                    />
                  </div>
                </>
              )}

              {/* ── System Prompt ── */}
              <div className="setting-group">
                <label htmlFor="settings-system-prompt" className="setting-label">System Prompt</label>
                <p className="setting-description">自定义 AI 的行为指令（留空使用默认值）</p>
                <textarea
                  id="settings-system-prompt"
                  className="system-prompt-textarea"
                  value={localConfig.systemPrompt ?? ''}
                  onChange={(e) => setLocalConfig((prev) => ({ ...prev, systemPrompt: e.target.value || undefined }))}
                  placeholder={DEFAULT_SYSTEM_PROMPT}
                  rows={6}
                />
                <button
                  type="button"
                  className="reset-prompt-button"
                  onClick={() => setLocalConfig((prev) => ({ ...prev, systemPrompt: undefined }))}
                >
                  恢复默认
                </button>
              </div>

              <div className="setting-actions">
                <button
                  className="test-button"
                  onClick={handleTestConnection}
                  type="button"
                  disabled={!localConfig.apiKey.trim() || testStatus === 'testing'}
                >
                  {testStatus === 'testing' ? (
                    <>
                      <SpinnerIos16Regular className="spinning" />
                      测试中...
                    </>
                  ) : testStatus === 'success' ? (
                    <>
                      <CheckmarkCircle16Regular />
                      连接成功
                    </>
                  ) : testStatus === 'error' ? (
                    <>
                      <DismissCircle16Regular />
                      测试失败
                    </>
                  ) : (
                    '测试连接'
                  )}
                </button>
                <button
                  className="save-button"
                  onClick={handleSave}
                  type="button"
                  disabled={!localConfig.apiKey.trim()}
                >
                  保存设置
                </button>
              </div>
              {testMessage && (
                <div className={`test-result ${testStatus}`}>
                  {testStatus === 'success' && <CheckmarkCircle16Regular />}
                  {testStatus === 'error' && <DismissCircle16Regular />}
                  <span>{testMessage}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="about-section">
              <div className="about-header">
                <h3 className="about-title">Claude Sidebar for Excel</h3>
                <p className="about-version">Version 1.0.0</p>
              </div>
              <div className="about-content">
                <p className="about-description">
                  An unofficial AI assistant for Excel, powered by Claude and OpenAI-compatible APIs.
                </p>
                <div className="about-credits">
                  <h4 className="credits-title">Built by</h4>
                  <div className="credit-item">
                    <span className="credit-name">James Frewin</span>
                    <div className="credit-links">
                      <a href="https://twitter.com/jamesfrewin1" target="_blank" rel="noopener noreferrer" className="credit-link">Twitter</a>
                      <a href="https://linkedin.com/in/jamesfrewin" target="_blank" rel="noopener noreferrer" className="credit-link">LinkedIn</a>
                      <a href="https://github.com/heyimjames" target="_blank" rel="noopener noreferrer" className="credit-link">GitHub</a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

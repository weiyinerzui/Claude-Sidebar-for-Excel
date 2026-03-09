import { useState } from 'react';
import { Button } from '@fluentui/react-components';
import type { ApiProviderConfig } from '../lib/types';
import { PRESET_PROVIDERS } from '../lib/providers';
import '../styles/api-key-setup.css';

interface ApiKeySetupProps {
  onSave: (config: ApiProviderConfig) => void;
}

type ProviderMode = 'anthropic' | string; // string = preset id

export default function ApiKeySetup({ onSave }: ApiKeySetupProps) {
  const [mode, setMode] = useState<ProviderMode>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [modelName, setModelName] = useState('');
  const [error, setError] = useState('');
  const [showKey, setShowKey] = useState(false);

  const selectedPreset = PRESET_PROVIDERS.find((p) => p.id === mode);

  const handleModeChange = (newMode: ProviderMode) => {
    setMode(newMode);
    setError('');
    // 预设服务商自动填入 Base URL 和默认模型
    const preset = PRESET_PROVIDERS.find((p) => p.id === newMode);
    if (preset && newMode !== 'anthropic') {
      setBaseUrl(preset.baseUrl);
      setModelName(preset.defaultModel);
    }
  };

  const handleSubmit = () => {
    if (!apiKey.trim()) {
      setError('请输入 API Key');
      return;
    }

    if (mode === 'anthropic') {
      if (!apiKey.startsWith('sk-ant-')) {
        setError('Anthropic API Key 格式错误，应以 sk-ant- 开头');
        return;
      }
      onSave({ type: 'anthropic', apiKey: apiKey.trim() });
    } else {
      if (!baseUrl.trim()) {
        setError('请输入 Base URL');
        return;
      }
      if (!modelName.trim()) {
        setError('请输入模型名称');
        return;
      }
      const preset = PRESET_PROVIDERS.find((p) => p.id === mode);
      onSave({
        type: 'custom',
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim(),
        modelName: modelName.trim(),
        providerName: preset?.name ?? '自定义',
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
  };

  return (
    <div className="api-key-setup">
      <div className="setup-content">
        {/* 标题 */}
        <div className="setup-header">
          <div className="setup-icon">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M24 4L4 14L24 24L44 14L24 4Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
              <path d="M4 34L24 44L44 34" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
              <path d="M4 24L24 34L44 24" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
            </svg>
          </div>
          <h1>Welcome to AI Sidebar for Excel</h1>
          <p>选择 AI 服务商并配置 API Key 开始使用</p>
        </div>

        {/* Provider 选择 */}
        <div className="setup-form">
          <div className="setup-provider-section">
            <label className="setup-field-label">选择服务商</label>
            <div className="setup-provider-grid">
              {/* Anthropic */}
              <button
                type="button"
                className={`setup-provider-card ${mode === 'anthropic' ? 'active' : ''}`}
                onClick={() => handleModeChange('anthropic')}
              >
                <span className="setup-provider-icon">🤖</span>
                <span className="setup-provider-name">Anthropic</span>
                <span className="setup-provider-tag">Claude</span>
              </button>
              {/* 预设服务商 + 自定义 */}
              {PRESET_PROVIDERS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`setup-provider-card ${mode === preset.id ? 'active' : ''}`}
                  onClick={() => handleModeChange(preset.id)}
                >
                  <span className="setup-provider-name">{preset.name}</span>
                  <span className="setup-provider-tag">
                    {preset.id === 'custom' ? '自定义' : preset.defaultModel}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* API Key 输入 */}
          <div className="setup-field">
            <label className="setup-field-label">
              {mode === 'anthropic' ? 'Anthropic API Key' : `${selectedPreset?.name ?? '自定义'} API Key`}
            </label>
            {selectedPreset?.apiKeyHint && (
              <p className="setup-field-hint">{selectedPreset.apiKeyHint}</p>
            )}
            <div className="setup-input-group">
              <input
                type={showKey ? 'text' : 'password'}
                className="setup-input"
                placeholder={mode === 'anthropic' ? 'sk-ant-...' : (selectedPreset?.apiKeyPlaceholder ?? '输入 API Key...')}
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setError(''); }}
                onKeyDown={handleKeyDown}
              />
              <button
                type="button"
                className="setup-toggle-key"
                onClick={() => setShowKey(!showKey)}
                aria-label={showKey ? 'Hide key' : 'Show key'}
              >
                {showKey ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* 自定义模式额外字段 */}
          {mode !== 'anthropic' && (
            <>
              <div className="setup-field">
                <label className="setup-field-label">Base URL</label>
                <input
                  type="text"
                  className="setup-input"
                  placeholder="https://api.example.com/v1"
                  value={baseUrl}
                  onChange={(e) => { setBaseUrl(e.target.value); setError(''); }}
                  onKeyDown={handleKeyDown}
                />
              </div>
              <div className="setup-field">
                <label className="setup-field-label">模型名称</label>
                <input
                  type="text"
                  className="setup-input"
                  placeholder={selectedPreset?.defaultModel ?? 'gpt-4o-mini'}
                  value={modelName}
                  onChange={(e) => { setModelName(e.target.value); setError(''); }}
                  onKeyDown={handleKeyDown}
                />
              </div>
            </>
          )}

          {/* 错误提示 */}
          {error && <p className="setup-error">{error}</p>}

          <Button
            appearance="primary"
            onClick={handleSubmit}
            disabled={!apiKey.trim()}
            size="large"
            className="submit-button"
          >
            开始使用
          </Button>

          <div className="setup-help">
            {mode === 'anthropic' ? (
              <>
                <p className="help-text">
                  没有 API Key?{' '}
                  <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer">
                    从 Anthropic 获取
                  </a>
                </p>
              </>
            ) : selectedPreset?.apiKeyHint ? (
              <p className="help-text">{selectedPreset.apiKeyHint}</p>
            ) : null}
            <p className="help-note">
              您的 API Key 仅存储在本地 Excel 工作簿设置中，不会上传任何服务器。
            </p>
          </div>
        </div>

        {/* 功能介绍 */}
        <div className="setup-features">
          <h2>可以为您做什么</h2>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">📊</div>
              <h3>数据分析</h3>
              <p>理解表格数据的规律与趋势</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">✏️</div>
              <h3>内容编辑</h3>
              <p>批量修改单元格、应用公式</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">📈</div>
              <h3>创建图表</h3>
              <p>一键从数据生成可视化图表</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🔍</div>
              <h3>智能问答</h3>
              <p>对数据提问，获得深度解释</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import ChatInterface from './components/ChatInterface';
import ApiKeySetup from './components/ApiKeySetup';
import { ErrorBoundary } from './components/ErrorBoundary';
import type { ApiProviderConfig } from './lib/types';
import './styles/design-tokens.css';

/* global Office */

const SETTINGS_KEY = 'api_provider_config';

export default function App() {
  const [config, setConfig] = useState<ApiProviderConfig | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    try {
      // 优先读取新格式配置
      const saved = Office.context.document.settings.get(SETTINGS_KEY);
      if (saved) {
        setConfig(JSON.parse(saved as string) as ApiProviderConfig);
      } else {
        // 向下兼容旧版 anthropic_api_key
        const legacyKey = Office.context.document.settings.get('anthropic_api_key');
        if (legacyKey) {
          setConfig({ type: 'anthropic', apiKey: legacyKey as string });
        }
      }
    } catch (error) {
      console.error('Error loading config:', error);
    }
    setIsReady(true);
  }, []);

  const handleConfigSave = async (newConfig: ApiProviderConfig) => {
    try {
      setConfig(newConfig);
      Office.context.document.settings.set(SETTINGS_KEY, JSON.stringify(newConfig));
      await new Promise<void>((resolve, reject) => {
        Office.context.document.settings.saveAsync((result) => {
          if (result.status === Office.AsyncResultStatus.Succeeded) {
            resolve();
          } else {
            reject(new Error('Failed to save config'));
          }
        });
      });
    } catch (error) {
      console.error('Error saving config:', error);
    }
  };

  if (!isReady) {
    return (
      <FluentProvider theme={webLightTheme}>
        <div style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fafafa'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>⏳</div>
            <div>Loading...</div>
          </div>
        </div>
      </FluentProvider>
    );
  }

  return (
    <FluentProvider theme={webLightTheme}>
      <ErrorBoundary>
        {config ? (
          <ChatInterface config={config} onConfigChange={handleConfigSave} />
        ) : (
          <ApiKeySetup onSave={handleConfigSave} />
        )}
      </ErrorBoundary>
    </FluentProvider>
  );
}

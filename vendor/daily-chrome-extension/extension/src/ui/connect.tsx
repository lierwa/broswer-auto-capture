/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from './tabItem';
import { AuthTokenSection, getOrCreateAuthToken } from './authToken';

type Status =
  | { type: 'connecting'; message: string }
  | { type: 'connected'; message: string }
  | { type: 'error'; message: string }
  | { type: 'error'; versionMismatch: { extensionVersion: string; } };

const SUPPORTED_PROTOCOL_VERSION = 2;

// Client name comes from the URL and never changes for the lifetime of this page.
const clientInfo = (() => {
  try {
    return JSON.parse(new URLSearchParams(window.location.search).get('client') || '{}').name || 'unknown';
  } catch {
    return 'unknown';
  }
})();

const ConnectApp: React.FC = () => {
  const [status, setStatus] = useState<Status | null>(null);

  const setError = useCallback((message: string) => {
    setStatus({ type: 'error', message });
  }, []);

  useEffect(() => {
    void initializeConnection(setStatus, setError, handleConnectToTab);
    // Ping the background every 20s so the MV3 service worker (which holds the
    // pending connection state) stays above its 30s idle timeout while the
    // user decides.
    const keepalive = setInterval(() => {
      chrome.runtime.sendMessage({ type: 'keepalive' }).catch(() => {});
    }, 20_000);
    return () => clearInterval(keepalive);
  }, []);

  const handleConnectToTab = useCallback(async () => {

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'connectToTab',
        clientName: clientInfo,
      });

      if (response?.success) {
        setStatus({ type: 'connected', message: `"${clientInfo}" connected.` });
      } else {
        setStatus({
          type: 'error',
          message: response?.error || `"${clientInfo}" failed to connect.`
        });
      }
    } catch (e) {
      setStatus({
        type: 'error',
        message: `"${clientInfo}" failed to connect: ${e}`
      });
    }
  }, []);

  return (
    <div className='app-container'>
      <div className='content-wrapper'>
        {status && (
          <div className='status-container'>
            <StatusBanner status={status} />
          </div>
        )}

        {status?.type === 'connecting' && (
          <div className='warning-banner'>
            连接后，B-A-T 仅控制任务创建的窗口和所属标签页。个人标签页不会因拖入分组而获得控制授权。
          </div>
        )}

        {status?.type === 'connecting' && (
          <AuthTokenSection />
        )}
        {status?.type === 'connecting' && (
          <Button variant='primary' onClick={() => handleConnectToTab()}>连接任务窗口</Button>
        )}

      </div>
    </div>
  );
};

async function initializeConnection(setStatus: (value: Status) => void,
  setError: (message: string) => void, handleConnectToTab: () => Promise<void>): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const relayUrl = params.get('mcpRelayUrl');

  if (!relayUrl) {
    setError('Missing mcpRelayUrl parameter in URL.');
    return;
  }

  try {
    const host = new URL(relayUrl).hostname;
    if (host !== '127.0.0.1' && host !== '[::1]') {
      setError(`Playwright extension only allows loopback connections (127.0.0.1 or [::1]). Received host: ${host}`);
      return;
    }
  } catch (e) {
    setError(`Invalid mcpRelayUrl parameter in URL: ${relayUrl}. ${e}`);
    return;
  }

  setStatus({
    type: 'connecting',
    message: `"${clientInfo}" is trying to connect to the Playwright Extension.`
  });

  const parsedVersion = parseInt(params.get('protocolVersion') ?? '', 10);
  const requestedVersion = isNaN(parsedVersion) ? 1 : parsedVersion;
  if (requestedVersion > SUPPORTED_PROTOCOL_VERSION) {
    const extensionVersion = chrome.runtime.getManifest().version;
    setStatus({
      type: 'error',
      versionMismatch: {
        extensionVersion,
      }
    });
    return;
  }
  if (requestedVersion < SUPPORTED_PROTOCOL_VERSION) {
    setError('当前连接协议版本不兼容，请使用 B-A-T 提供的扩展包。');
    return;
  }
  // The background only records the relay URL; the WS to the relay opens
  // once the user clicks Allow.
  await chrome.runtime.sendMessage({ type: 'connectionRequested', mcpRelayUrl: relayUrl });

  const expectedToken = getOrCreateAuthToken();
  const token = params.get('token');
  if (token === expectedToken) {
    await handleConnectToTab();
    return;
  }
  if (token) {
    setError('Invalid token provided.');
    return;
  }

}

const VersionMismatchError: React.FC<{ extensionVersion: string }> = ({ extensionVersion }) => {
  return <div>扩展版本 {extensionVersion} 与当前 B-A-T 不兼容，请重新加载 B-A-T 提供的扩展包。</div>;
};

const StatusBanner: React.FC<{ status: Status }> = ({ status }) => {
  return (
    <div className={`status-banner ${status.type}`}>
      {'versionMismatch' in status ? (
        <VersionMismatchError
          extensionVersion={status.versionMismatch.extensionVersion}
        />
      ) : (
        status.message
      )}
    </div>
  );
};

// Initialize the React app
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<ConnectApp />);
}

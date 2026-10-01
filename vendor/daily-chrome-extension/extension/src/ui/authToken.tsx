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

import React, { useCallback, useState } from 'react';
import { CopyToClipboard } from './copyToClipboard';
import * as icons from './icons';
import './authToken.css';

export const AuthTokenSection: React.FC<{}> = ({}) => {
  const [authToken, setAuthToken] = useState<string>(getOrCreateAuthToken);

  const onRegenerateToken = useCallback(async () => {
    const newToken = generateAuthToken();
    localStorage.setItem('auth-token', newToken);
    setAuthToken(newToken);
    // WHY：原 token 的撤销必须立即结束现有控制；复用原消息，不发明另一套授权协议。
    const status = await chrome.runtime.sendMessage({ type: 'getConnectionStatus' });
    await Promise.all((status.connections ?? []).map((connection: {id: number}) =>
      chrome.runtime.sendMessage({ type: 'disconnect', connectionId: connection.id })));
  }, []);

  return (
    <div className='auth-token-section'>
      <div className='auth-token-description'>
        将授权码填入 B-A-T 的日常浏览器授权，之后可直接连接。撤销会立即断开控制。
      </div>
      <div className='auth-token-container'>
        <code className='auth-token-code'>{authTokenCode(authToken)}</code>
        <button className='auth-token-refresh' title='撤销并生成新授权码' aria-label='撤销并生成新授权码' onClick={onRegenerateToken}>{icons.refresh()}</button>
        <CopyToClipboard value={authTokenCode(authToken)} />
      </div>
    </div>
  );
};

function authTokenCode(authToken: string) {
  return authToken;
}

function generateAuthToken(): string {
  // Generate a cryptographically secure random token
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  // Convert to base64 and make it URL-safe
  return btoa(String.fromCharCode.apply(null, Array.from(array)))
      .replace(/[+/=]/g, match => {
        switch (match) {
          case '+': return '-';
          case '/': return '_';
          case '=': return '';
          default: return match;
        }
      });
}

export const getOrCreateAuthToken = (): string => {
  let token = localStorage.getItem('auth-token');
  if (!token) {
    token = generateAuthToken();
    localStorage.setItem('auth-token', token);
  }
  return token;
};

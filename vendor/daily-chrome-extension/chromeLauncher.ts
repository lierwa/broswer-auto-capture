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

import {spawn} from 'node:child_process';
import os from 'node:os';

// 固定Playwright launcher原逻辑抽出以保持单文件规模；没有第二套启动器。
export function openChrome(channel: string, executablePath: string | undefined, customUserDataDir: string | undefined,
  profileDirectory: string | undefined, href?: string): void {
    if (!executablePath)
      throw new Error('daily_chrome_executable_required');

    const args: string[] = [];
    // The default profile dir is not passed explicitly, the browser resolves it on its own.
    if (customUserDataDir)
      args.push(`--user-data-dir=${customUserDataDir}`);
    if (profileDirectory)
      args.push(`--profile-directory=${profileDirectory}`);
    if (os.platform() === 'linux' && channel === 'chromium')
      args.push('--no-sandbox');
    // WHY：已授权后台连接只唤醒指定Profile；不创建中转tab或借用个人页面。
    args.push(href ?? '--no-startup-window');
    const child = spawn(executablePath, args, {
      windowsHide: true,
      detached: true,
      shell: false,
      stdio: 'ignore',
    });
    // Chrome 已有实例时启动器会退出；原进程仍由用户拥有。
    child.on('error', () => {});
    child.unref();
}

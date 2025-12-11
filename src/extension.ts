/**
 * 说明：VS Code扩展入口
 * 功能：注册命令，扫描Spring Boot接口并打开调试Webview面板；
 *      在扩展侧发送HTTP/HTTPS请求，避免Webview环境的CORS问题。
 */
import * as vscode from 'vscode';
import { scanSpringBootEndpoints, Endpoint } from './scanner';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel('Easy API Try');
  const disposable = vscode.commands.registerCommand('trae.scanSpringBootEndpoints', async () => {
    output.appendLine('命令执行：扫描 Spring Boot 接口并打开调试器');
    let endpoints = await scanSpringBootEndpoints((m) => output.appendLine(m));
    const panel = vscode.window.createWebviewPanel(
      'traeSpringBootDebugger',
      'Easy API Try',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    const nonce = getNonce();
    const scriptUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'main.js'));
    panel.webview.html = getHtml(panel.webview, scriptUri.toString(), nonce);

    panel.webview.onDidReceiveMessage(async (msg) => {
      if (!msg || !msg.type) return;
      if (msg.type === 'ready') {
        output.appendLine('Webview 已就绪，发送初始化接口列表');
        panel.webview.postMessage({ type: 'init', payload: { endpoints } });
        return;
      }
      if (msg.type === 'refresh') {
        output.appendLine('收到刷新请求，重新扫描接口');
        endpoints = await scanSpringBootEndpoints((m) => output.appendLine(m));
        panel.webview.postMessage({ type: 'init', payload: { endpoints } });
        return;
      }
      if (msg.type === 'sendRequest') {
        const { baseUrl, method, path, headers, body } = msg.payload || {};
        try {
          output.appendLine(`发送请求：${method} ${new URL(path, baseUrl.endsWith('/') ? baseUrl : baseUrl + '/').toString()}`);
          const result = await performRequest(baseUrl, method, path, headers, body);
          output.appendLine(`响应：${result.status} ${result.statusMessage}`);
          panel.webview.postMessage({ type: 'response', payload: result });
        } catch (err: any) {
          output.appendLine(`请求失败：${String(err?.message || err)}`);
          panel.webview.postMessage({ type: 'response', payload: { error: String(err?.message || err) } });
        }
        return;
      }
    }, undefined, context.subscriptions);
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}

function getHtml(webview: vscode.Webview, scriptSrc: string, nonce: string): string {
  const csp = `default-src 'none'; img-src ${webview.cspSource} https:; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}';`;
  const bodyPlaceholder = '{"name": "Tom"}';
  return `<!DOCTYPE html>
  <html lang="zh-cn">
    <head>
      <meta charset="UTF-8" />
      <meta http-equiv="Content-Security-Policy" content="${csp}" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Easy API Try</title>
      <style>
        body { font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); }
        .container { display: grid; grid-template-columns: 320px 1fr; height: 100vh; }
        .list { border-right: 1px solid var(--vscode-panel-border); overflow: auto; }
        .toolbar { padding: 8px; border-bottom: 1px solid var(--vscode-panel-border); position: sticky; top: 0; background: var(--vscode-editor-background); }
        .item { padding: 8px 12px; border-bottom: 1px solid var(--vscode-panel-border); cursor: pointer; }
        .item:hover { background: var(--vscode-list-hoverBackground); }
        .item.selected { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
        .method { display: inline-block; min-width: 60px; font-weight: bold; }
        .path { margin-left: 8px; word-break: break-all; }
        .form { padding: 12px; }
        .row { margin-bottom: 8px; }
        .label { font-size: 12px; opacity: 0.8; }
        input, textarea, select { width: 100%; box-sizing: border-box; padding: 6px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); }
        textarea { height: 140px; }
        button { padding: 6px 12px; }
        .response { white-space: pre-wrap; background: var(--vscode-textCodeBlock-background); padding: 10px; border: 1px solid var(--vscode-panel-border); }
        .pathVars { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .kv { display: flex; align-items: center; gap: 6px; }
        .kv label { min-width: 80px; }
        .headers { width: 100%; border-collapse: collapse; }
        .headers th, .headers td { border: 1px solid var(--vscode-panel-border); padding: 6px; }
        .headers input { width: 100%; box-sizing: border-box; padding: 6px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="list">
          <div class="toolbar"><button id="refreshBtn">刷新接口</button></div>
          <div id="endpointList"></div>
        </div>
        <div class="form">
          <div class="row"><div class="label">主机</div><input id="hostInput" placeholder="localhost" /></div>
          <div class="row"><div class="label">协议</div>
            <select id="protocolSelect">
              <option value="http">http</option>
              <option value="https">https</option>
            </select>
          </div>
          <div class="row"><div class="label">端口（默认 8080）</div><input id="portInput" placeholder="8080" /></div>
          <div class="row"><div class="label">选择的接口</div><input id="selectedEndpoint" disabled /></div>
          <div class="row"><div class="label">路径变量</div><div id="pathVars" class="pathVars"></div></div>
          <div class="row">
            <div class="label">请求头</div>
            <div class="headersWrap">
              <div class="toolbar"><button id="addHeaderBtn">新增请求头</button></div>
              <table id="headersTable" class="headers">
                <thead>
                  <tr><th>Key</th><th>Value</th><th>操作</th></tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
          <div class="row"><div class="label">请求体（原始字符串或JSON）</div>
            <div>
              <textarea id="bodyInput" placeholder="${bodyPlaceholder.replace(/\"/g, '&quot;')}"></textarea>
              <div style="margin-top:6px"><button id="formatBodyBtn">格式化JSON</button></div>
            </div>
          </div>
          <div class="row"><button id="sendBtn">发送请求</button></div>
          <div class="row"><div class="label">响应</div><div id="response" class="response"></div></div>
        </div>
      </div>
      <script nonce="${nonce}" src="${scriptSrc}"></script>
    </body>
  </html>`;
}

async function performRequest(baseUrl: string, method: string, path: string, headers: Record<string, string>, body?: string): Promise<any> {
  if (!baseUrl) throw new Error('请填写基础URL');
  if (!method || !path) throw new Error('请求信息不完整');
  const urlObj = new URL(path, baseUrl.endsWith('/') ? baseUrl : baseUrl + '/');
  const isHttps = urlObj.protocol === 'https:';

  const opts: (http.RequestOptions & https.RequestOptions) = {
    method,
    headers: headers || {},
  };

  return new Promise((resolve, reject) => {
    const lib = isHttps ? https : http;
    const req = lib.request(urlObj, opts, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (d) => chunks.push(Buffer.from(d)));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const text = buf.toString('utf8');
        const headersObj: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          headersObj[k] = Array.isArray(v) ? v.join(', ') : String(v);
        }
        resolve({
          url: urlObj.toString(),
          status: res.statusCode,
          statusMessage: res.statusMessage,
          headers: headersObj,
          bodyText: text,
        });
      });
    });

    req.on('error', (err) => reject(err));

    if (body && method.toUpperCase() !== 'GET') {
      req.write(body);
    }
    req.end();
  });
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

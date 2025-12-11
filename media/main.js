/**
 * 说明：Webview主脚本
 * 功能：渲染接口列表，收集请求参数，向扩展发送请求并展示响应。
 */
(function () {
  const vscode = acquireVsCodeApi();
  let endpoints = [];
  let selected = null;
  let selectedElement = null;
  console.log('[Trae-SB] Webview 初始化');

  const listEl = document.getElementById('endpointList');
  const selectedEl = document.getElementById('selectedEndpoint');
  const hostEl = document.getElementById('hostInput');
  const protocolEl = document.getElementById('protocolSelect');
  const portEl = document.getElementById('portInput');
  const pathVarsEl = document.getElementById('pathVars');
  const headersTable = document.getElementById('headersTable');
  const addHeaderBtn = document.getElementById('addHeaderBtn');
  const bodyInputEl = document.getElementById('bodyInput');
  const formatBodyBtn = document.getElementById('formatBodyBtn');
  const sendBtn = document.getElementById('sendBtn');
  const responseEl = document.getElementById('response');
  const refreshBtn = document.getElementById('refreshBtn');

  vscode.postMessage({ type: 'ready' });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (!msg) return;
    if (msg.type === 'init') {
      endpoints = (msg.payload?.endpoints) || [];
      console.log('[Trae-SB] 收到初始化接口列表，数量：', endpoints.length);
      renderList(endpoints);
      if (hostEl && !hostEl.value) hostEl.value = 'localhost';
      if (protocolEl) protocolEl.value = 'http';
      if (portEl && !portEl.value) portEl.value = '8080';
      ensureDefaultHeaders();
    }
    if (msg.type === 'response') {
      const p = msg.payload || {};
      console.log('[Trae-SB] 收到响应：', { status: p.status, url: p.url });
      responseEl.textContent = formatResponse(p);
    }
  });

  function renderList(items) {
    listEl.innerHTML = '';
    selectedElement = null;
    if (!items || items.length === 0) {
      listEl.innerHTML = '<div class="item">未扫描到接口。请确认工作区为Spring Boot项目。</div>';
      console.log('[Trae-SB] 当前列表为空');
      return;
    }
    console.log('[Trae-SB] 渲染接口列表');
    items.forEach((it) => {
      const div = document.createElement('div');
      div.className = 'item';
      div.innerHTML = `<span class="method">${escapeHtml(it.method)}</span><span class="path">${escapeHtml(it.path)}</span>`;
      div.addEventListener('click', () => {
        selected = it;
        selectedEl.value = `${it.method} ${it.path}`;
        renderPathVars(it);
        console.log('[Trae-SB] 选择接口：', it.method, it.path);
        if (selectedElement) selectedElement.classList.remove('selected');
        div.classList.add('selected');
        selectedElement = div;
      });
      listEl.appendChild(div);
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      console.log('[Trae-SB] 点击刷新接口');
      vscode.postMessage({ type: 'refresh' });
    });
  }

  if (addHeaderBtn) {
    addHeaderBtn.addEventListener('click', () => {
      addHeaderRow('', '');
    });
  }

  function ensureDefaultHeaders() {
    const tbody = headersTable.querySelector('tbody');
    if (!tbody) return;
    if (tbody.children.length === 0) {
      addHeaderRow('Accept', 'application/json, text/plain, */*');
      addHeaderRow('Content-Type', 'application/json');
    }
  }

  function addHeaderRow(key, value) {
    const tbody = headersTable.querySelector('tbody');
    const tr = document.createElement('tr');
    const tdKey = document.createElement('td');
    const tdValue = document.createElement('td');
    const tdOps = document.createElement('td');
    const keyInput = document.createElement('input');
    keyInput.placeholder = 'Header Key';
    keyInput.value = key || '';
    const valInput = document.createElement('input');
    valInput.placeholder = 'Header Value';
    valInput.value = value || '';
    const delBtn = document.createElement('button');
    delBtn.textContent = '删除';
    delBtn.addEventListener('click', () => {
      tr.remove();
    });
    tdKey.appendChild(keyInput);
    tdValue.appendChild(valInput);
    tdOps.appendChild(delBtn);
    tr.appendChild(tdKey);
    tr.appendChild(tdValue);
    tr.appendChild(tdOps);
    tbody.appendChild(tr);
  }

  function collectHeadersFromTable() {
    const tbody = headersTable.querySelector('tbody');
    const map = {};
    Array.from(tbody.children).forEach((tr) => {
      const inputs = tr.querySelectorAll('input');
      const key = inputs[0]?.value?.trim();
      const val = inputs[1]?.value?.trim();
      if (key) map[key] = val ?? '';
    });
    return map;
  }

  sendBtn.addEventListener('click', () => {
    if (!selected) {
      console.log('[Trae-SB] 发送请求失败：未选择接口');
      vscode.postMessage({ type: 'response', payload: { error: '请先在左侧选择一个接口' } });
      return;
    }
    const host = (hostEl && hostEl.value ? hostEl.value.trim() : 'localhost');
    const protocol = (protocolEl && protocolEl.value ? protocolEl.value : 'http');
    const port = (portEl && portEl.value ? portEl.value.trim() : '8080');
    const baseUrl = buildBaseUrl(host, port, protocol);
    if (baseUrl.error) {
      console.log('[Trae-SB] 基础地址不合法：', baseUrl.error);
      responseEl.textContent = '基础地址不合法：' + baseUrl.error;
      return;
    }
    const finalPath = applyPathVars(selected.path, collectPathVarValues());
    if (finalPath.error) {
      console.log('[Trae-SB] 路径变量缺失：', finalPath.error);
      responseEl.textContent = '路径变量缺失：' + finalPath.error;
      return;
    }
    const headers = collectHeadersFromTable();
    const body = bodyInputEl.value;
    console.log('[Trae-SB] 发送请求：', { method: selected.method, url: `${baseUrl.url}/${finalPath.path}`, headers });
    vscode.postMessage({ type: 'sendRequest', payload: { baseUrl: baseUrl.url, method: selected.method, path: finalPath.path, headers, body } });
  });

  if (formatBodyBtn) {
    formatBodyBtn.addEventListener('click', () => {
      const raw = bodyInputEl.value.trim();
      if (!raw) return;
      try {
        const json = JSON.parse(raw);
        bodyInputEl.value = JSON.stringify(json, null, 2);
      } catch (e) {
        responseEl.textContent = '格式化失败：不是合法的JSON';
      }
    });
  }

  function formatResponse(p) {
    if (p.error) return `错误：${p.error}`;
    const statusLine = `Status: ${p.status} ${p.statusMessage || ''}`;
    const headers = p.headers ? JSON.stringify(p.headers, null, 2) : '{}';
    let bodyText = p.bodyText || '';
    const ct = (p.headers && (p.headers['content-type'] || p.headers['Content-Type'])) || '';
    const looksJson = ct.toLowerCase().includes('application/json') || /^[\[{]/.test(bodyText.trim());
    if (looksJson) {
      try {
        const parsed = JSON.parse(bodyText);
        bodyText = JSON.stringify(parsed, null, 2);
      } catch (_) {
        // 保持原样
      }
    }
    return `${statusLine}\n\nHeaders:\n${headers}\n\nBody:\n${bodyText}`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }

  function renderPathVars(ep) {
    pathVarsEl.innerHTML = '';
    const vars = Array.isArray(ep.variables) ? ep.variables : [];
    if (vars.length === 0) return;
    vars.forEach((name) => {
      const wrap = document.createElement('div');
      wrap.className = 'kv';
      const label = document.createElement('label');
      label.textContent = name;
      label.setAttribute('for', `pv_${name}`);
      const input = document.createElement('input');
      input.id = `pv_${name}`;
      input.placeholder = name;
      wrap.appendChild(label);
      wrap.appendChild(input);
      pathVarsEl.appendChild(wrap);
    });
  }

  function collectPathVarValues() {
    const map = {};
    const inputs = pathVarsEl.querySelectorAll('input[id^="pv_"]');
    inputs.forEach((el) => {
      const id = el.id.replace(/^pv_/, '');
      map[id] = el.value.trim();
    });
    return map;
  }

  function applyPathVars(path, values) {
    const miss = [];
    const out = String(path).replace(/\{([^}]+)\}/g, (m, name) => {
      const v = values[name];
      if (v === undefined || v === '') {
        miss.push(name);
        return m;
      }
      return encodeURIComponent(v);
    });
    if (miss.length > 0) return { error: miss.join(', ') };
    return { path: out };
  }

  function buildBaseUrl(host, port, protocol) {
    const h = String(host).trim();
    const p = String(port).trim();
    const proto = protocol === 'https' ? 'https' : 'http';
    if (!h) return { error: '主机不能为空' };
    if (!/^[0-9]{1,5}$/.test(p)) return { error: '仅支持数字端口' };
    const num = Number(p);
    if (num < 1 || num > 65535) return { error: '端口范围应为1-65535' };
    try {
      const url = `${proto}://${h}:${num}`;
      new URL(url);
      return { url };
    } catch (e) {
      return { error: '主机或协议不合法' };
    }
  }
})();


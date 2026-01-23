// 加载配置
document.addEventListener('DOMContentLoaded', async () => {
  const config = await chrome.storage.sync.get(['workersUrl', 'uuid', 'enabled']);
  
  document.getElementById('workersUrl').value = config.workersUrl || '';
  document.getElementById('uuid').value = config.uuid || '';
  document.getElementById('enabled').checked = config.enabled !== false;
});

// 保存配置
document.getElementById('saveBtn').addEventListener('click', async () => {
  const workersUrl = document.getElementById('workersUrl').value.trim();
  const uuid = document.getElementById('uuid').value.trim();
  const enabled = document.getElementById('enabled').checked;
  
  const statusEl = document.getElementById('status');
  
  // 验证
  if (!workersUrl) {
    statusEl.textContent = '请填写 Workers 地址';
    statusEl.className = 'status error';
    return;
  }
  
  if (!uuid) {
    statusEl.textContent = '请填写 UUID';
    statusEl.className = 'status error';
    return;
  }
  
  // UUID 格式验证
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(uuid)) {
    statusEl.textContent = 'UUID 格式不正确';
    statusEl.className = 'status error';
    return;
  }
  
  // 保存
  await chrome.storage.sync.set({ workersUrl, uuid, enabled });
  
  statusEl.textContent = '配置已保存';
  statusEl.className = 'status success';
  
  // 通知 content script 更新配置
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0] && tabs[0].url.includes('github.com')) {
    chrome.tabs.sendMessage(tabs[0].id, { type: 'CONFIG_UPDATED', config: { workersUrl, uuid, enabled } });
  }
  
  setTimeout(() => {
    statusEl.className = 'status';
  }, 2000);
});


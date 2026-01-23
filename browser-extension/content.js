// CFspider GitHub 加速 - Content Script

(function() {
  'use strict';
  
  let config = { workersUrl: '', uuid: '', enabled: true };
  
  // GitHub 下载链接匹配模式
  const GITHUB_DOWNLOAD_PATTERNS = [
    /https:\/\/github\.com\/[^\/]+\/[^\/]+\/releases\/download\/.+/,
    /https:\/\/github\.com\/[^\/]+\/[^\/]+\/archive\/.+/,
    /https:\/\/github\.com\/[^\/]+\/[^\/]+\/raw\/.+/,
    /https:\/\/objects\.githubusercontent\.com\/.+/,
    /https:\/\/raw\.githubusercontent\.com\/.+/,
    /https:\/\/codeload\.github\.com\/.+/,
    /https:\/\/github\.com\/[^\/]+\/[^\/]+\/suites\/\d+\/artifacts\/.+/
  ];
  
  // 检查是否是 GitHub 下载链接
  function isGitHubDownloadLink(url) {
    return GITHUB_DOWNLOAD_PATTERNS.some(pattern => pattern.test(url));
  }
  
  // 生成加速链接
  function generateAcceleratedUrl(originalUrl) {
    if (!config.workersUrl || !config.uuid) return null;
    
    // 构建代理 URL
    const workersHost = config.workersUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const encodedUrl = encodeURIComponent(originalUrl);
    
    // 使用 /proxy API
    return `https://${workersHost}/proxy?url=${encodedUrl}&method=GET`;
  }
  
  // 创建加速按钮
  function createAccelerateButton(link) {
    // 检查是否已添加按钮
    if (link.nextElementSibling?.classList.contains('cfspider-btn')) return;
    if (link.parentElement.querySelector('.cfspider-btn')) return;
    
    const btn = document.createElement('a');
    btn.className = 'cfspider-btn';
    btn.innerHTML = `
      <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
        <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm4.879-2.773 4.264 2.559a.25.25 0 0 1 0 .428l-4.264 2.559A.25.25 0 0 1 6 10.559V5.442a.25.25 0 0 1 .379-.215Z"/>
      </svg>
      加速
    `;
    btn.title = 'CFspider 加速下载';
    btn.href = generateAcceleratedUrl(link.href) || '#';
    btn.target = '_blank';
    
    // 点击事件
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (!config.workersUrl || !config.uuid) {
        alert('请先在 CFspider 扩展中配置 Workers 地址和 UUID');
        return;
      }
      
      // 开始下载
      const acceleratedUrl = generateAcceleratedUrl(link.href);
      if (acceleratedUrl) {
        // 显示加载状态
        btn.classList.add('loading');
        btn.innerHTML = `
          <svg class="spinner" viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
            <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z" opacity="0.3"/>
            <path d="M8 0a8 8 0 0 1 8 8h-1.5A6.5 6.5 0 0 0 8 1.5V0Z"/>
          </svg>
          加速中...
        `;
        
        try {
          // 直接打开加速链接
          window.open(acceleratedUrl, '_blank');
          
          setTimeout(() => {
            btn.classList.remove('loading');
            btn.innerHTML = `
              <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm4.879-2.773 4.264 2.559a.25.25 0 0 1 0 .428l-4.264 2.559A.25.25 0 0 1 6 10.559V5.442a.25.25 0 0 1 .379-.215Z"/>
              </svg>
              加速
            `;
          }, 1500);
        } catch (err) {
          console.error('CFspider 加速失败:', err);
          btn.classList.remove('loading');
          btn.innerHTML = '失败';
          setTimeout(() => {
            btn.innerHTML = `
              <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm4.879-2.773 4.264 2.559a.25.25 0 0 1 0 .428l-4.264 2.559A.25.25 0 0 1 6 10.559V5.442a.25.25 0 0 1 .379-.215Z"/>
              </svg>
              加速
            `;
          }, 2000);
        }
      }
    });
    
    // 插入按钮
    if (link.parentElement.classList.contains('d-flex') || 
        link.closest('.Box-row') || 
        link.closest('.release-main-section')) {
      link.parentElement.insertBefore(btn, link.nextSibling);
    } else {
      link.insertAdjacentElement('afterend', btn);
    }
  }
  
  // 扫描并处理下载链接
  function scanDownloadLinks() {
    if (!config.enabled) return;
    
    const links = document.querySelectorAll('a[href]');
    
    links.forEach(link => {
      if (isGitHubDownloadLink(link.href)) {
        createAccelerateButton(link);
      }
    });
  }
  
  // 加载配置
  async function loadConfig() {
    try {
      const result = await chrome.storage.sync.get(['workersUrl', 'uuid', 'enabled']);
      config = {
        workersUrl: result.workersUrl || '',
        uuid: result.uuid || '',
        enabled: result.enabled !== false
      };
    } catch (e) {
      console.error('CFspider: 加载配置失败', e);
    }
  }
  
  // 监听配置更新
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'CONFIG_UPDATED') {
      config = message.config;
      scanDownloadLinks();
    }
  });
  
  // 监听 DOM 变化
  const observer = new MutationObserver((mutations) => {
    let shouldScan = false;
    
    mutations.forEach(mutation => {
      if (mutation.addedNodes.length > 0) {
        shouldScan = true;
      }
    });
    
    if (shouldScan) {
      setTimeout(scanDownloadLinks, 100);
    }
  });
  
  // 初始化
  async function init() {
    await loadConfig();
    scanDownloadLinks();
    
    // 监听 DOM 变化
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // 页面导航时重新扫描（GitHub 使用 pjax）
    document.addEventListener('pjax:end', scanDownloadLinks);
    document.addEventListener('turbo:load', scanDownloadLinks);
  }
  
  // 页面加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();


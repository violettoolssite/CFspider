// API 文档主 JavaScript 文件

// 导航高亮
document.addEventListener('DOMContentLoaded', function() {
    // 根据当前页面高亮导航项
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
        const href = item.getAttribute('href');
        if (href === currentPage || (currentPage === 'index.html' && href === 'index.html')) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    // 平滑滚动
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // 代码块复制功能
    document.querySelectorAll('.code-block').forEach(block => {
        const pre = block.querySelector('pre');
        if (pre) {
            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-btn';
            copyBtn.textContent = '复制';
            copyBtn.style.cssText = 'position: absolute; top: 10px; right: 15px; background: rgba(0, 245, 255, 0.2); border: 1px solid var(--neon-cyan); color: var(--neon-cyan); padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;';
            
            block.style.position = 'relative';
            block.appendChild(copyBtn);

            copyBtn.addEventListener('click', function() {
                const text = pre.textContent;
                navigator.clipboard.writeText(text).then(() => {
                    copyBtn.textContent = '已复制!';
                    setTimeout(() => {
                        copyBtn.textContent = '复制';
                    }, 2000);
                });
            });
        }
    });
});


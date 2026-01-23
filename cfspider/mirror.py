"""
CFspider 网页镜像模块

将在线网页完整保存到本地，包括：
- HTML 页面（自动重写资源链接为相对路径）
- CSS 样式表（包括 @import 和 url() 引用）
- JavaScript 脚本
- 图片资源（PNG, JPG, WebP, SVG 等）
- 字体文件（WOFF, WOFF2, TTF 等）
- 其他资源（favicon, 视频, 音频等）

特性：
- 使用浏览器渲染：确保获取 JavaScript 动态生成的内容
- 并发下载：多线程下载资源，速度更快
- 隐身模式：自动使用完整浏览器请求头，避免被 CDN 拦截
- 自动打开预览：下载完成后自动在浏览器中预览

使用方式：
    >>> import cfspider
    >>> 
    >>> # 基本用法
    >>> result = cfspider.mirror("https://example.com")
    >>> print(result.index_file)  # ./mirror/index.html
    >>> 
    >>> # 指定保存目录
    >>> result = cfspider.mirror(
    ...     "https://example.com",
    ...     save_dir="./my_backup",
    ...     open_browser=False
    ... )
    >>> 
    >>> # 使用 VLESS 代理
    >>> result = cfspider.mirror(
    ...     "https://example.com",
    ...     cf_proxies="vless://uuid@host:443?path=/"
    ... )

目录结构：
    save_dir/
    ├── index.html              # 主页面
    └── assets/
        ├── css/                # CSS 文件
        ├── js/                 # JavaScript 文件
        ├── images/             # 图片文件
        ├── fonts/              # 字体文件
        └── other/              # 其他资源
"""

import os
import re
import hashlib
import webbrowser
from pathlib import Path
from urllib.parse import urljoin, urlparse, unquote
from dataclasses import dataclass, field
from typing import Optional, Dict, Set, List
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    from bs4 import BeautifulSoup
    BS4_AVAILABLE = True
except ImportError:
    BS4_AVAILABLE = False


@dataclass
class MirrorResult:
    """
    网页镜像结果
    
    包含镜像操作的所有结果信息。
    
    Attributes:
        index_file (str): 主 HTML 文件的完整路径
            例如："/home/user/mirror/index.html"
        assets_dir (str): 资源目录的完整路径
            例如："/home/user/mirror/assets"
        total_files (int): 下载的文件总数（包含 index.html）
        total_size (int): 所有文件的总大小（字节）
            可用 total_size / 1024 转换为 KB
        failed_urls (List[str]): 下载失败的 URL 列表
            格式：["url: error_message", ...]
        success (bool): 镜像是否成功
            True 表示主页面已成功保存（部分资源失败不影响）
    
    Example:
        >>> result = cfspider.mirror("https://example.com")
        >>> if result.success:
        ...     print(f"保存到: {result.index_file}")
        ...     print(f"文件数: {result.total_files}")
        ...     print(f"大小: {result.total_size / 1024:.2f} KB")
        ... else:
        ...     print(f"失败: {result.failed_urls}")
    """
    index_file: str = ""          # 主 HTML 文件路径
    assets_dir: str = ""          # 资源目录路径
    total_files: int = 0          # 下载的文件总数
    total_size: int = 0           # 总大小（字节）
    failed_urls: List[str] = field(default_factory=list)  # 下载失败的 URL
    success: bool = True          # 是否成功


class WebMirror:
    """
    网页镜像器
    
    完整下载网页及其所有资源，并重写链接为本地相对路径。
    
    工作流程：
        1. 使用 Playwright 浏览器渲染页面（获取 JS 动态内容）
        2. 解析 HTML 提取所有资源 URL
        3. 并发下载资源到本地
        4. 处理 CSS 文件中的额外资源（@import, url()）
        5. 重写所有资源链接为相对路径
        6. 保存最终的 HTML 文件
    
    Attributes:
        ASSET_TYPES (dict): 资源类型映射，用于分类保存文件
    
    Example:
        >>> mirrorer = WebMirror(max_workers=20)
        >>> result = mirrorer.mirror("https://example.com", save_dir="./backup")
    
    Note:
        直接使用 cfspider.mirror() 函数更方便，该函数会自动创建 WebMirror 实例。
    """
    
    # 资源类型映射，用于将资源分类保存到不同目录
    ASSET_TYPES = {
        'css': ['css'],
        'js': ['js', 'mjs'],
        'images': ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'avif'],
        'fonts': ['woff', 'woff2', 'ttf', 'otf', 'eot'],
        'media': ['mp4', 'webm', 'mp3', 'ogg', 'wav'],
        'other': []
    }
    
    def __init__(self, cf_proxies=None, vless_uuid=None, timeout=30, max_workers=10):
        """
        初始化镜像器
        
        Args:
            cf_proxies (str, optional): 代理地址，支持以下格式：
                - VLESS 链接："vless://uuid@host:port?path=/..."
                - HTTP 代理："http://ip:port"
                - SOCKS5 代理："socks5://ip:port"
                - 不填写：直接请求（无代理）
                注意：浏览器渲染使用 VLESS 代理，资源下载使用直连
            vless_uuid (str, optional): VLESS UUID
                仅当 cf_proxies 是域名（非完整链接）时需要
            timeout (int): 请求超时时间（秒），默认 30
                适用于浏览器渲染和资源下载
            max_workers (int): 并发下载线程数，默认 10
                增大可加快下载速度，但可能被目标网站限制
        
        Example:
            >>> # 无代理
            >>> mirrorer = WebMirror()
            >>> 
            >>> # VLESS 代理
            >>> mirrorer = WebMirror(cf_proxies="vless://uuid@host:443?path=/")
            >>> 
            >>> # 高并发
            >>> mirrorer = WebMirror(max_workers=20, timeout=60)
        """
        self.cf_proxies = cf_proxies
        self.vless_uuid = vless_uuid
        self.timeout = timeout
        self.max_workers = max_workers
        self._browser = None
        self._downloaded: Dict[str, str] = {}  # URL -> 本地路径映射
        self._failed: Set[str] = set()
        
    def _get_browser(self):
        """获取浏览器实例"""
        if self._browser is None:
            from .browser import Browser
            self._browser = Browser(
                cf_proxies=self.cf_proxies,
                headless=True,
                timeout=self.timeout,
                uuid=self.vless_uuid
            )
        return self._browser
    
    def _close_browser(self):
        """关闭浏览器"""
        if self._browser:
            try:
                self._browser.close()
            except:
                pass
            self._browser = None
    
    def _get_asset_type(self, url: str) -> str:
        """根据 URL 判断资源类型"""
        parsed = urlparse(url)
        path = parsed.path.lower()
        ext = path.rsplit('.', 1)[-1] if '.' in path else ''
        
        for asset_type, extensions in self.ASSET_TYPES.items():
            if ext in extensions:
                return asset_type
        return 'other'
    
    def _generate_local_path(self, url: str, base_url: str, assets_dir: Path) -> str:
        """生成本地文件路径"""
        parsed = urlparse(url)
        path = unquote(parsed.path)
        
        # 如果没有路径或是根路径，使用 hash
        if not path or path == '/':
            ext = '.html'
            filename = hashlib.md5(url.encode()).hexdigest()[:12] + ext
        else:
            # 提取文件名
            filename = path.rsplit('/', 1)[-1]
            if not filename or '.' not in filename:
                ext = self._guess_extension(url)
                filename = hashlib.md5(url.encode()).hexdigest()[:12] + ext
        
        # 确定资源类型目录
        asset_type = self._get_asset_type(url)
        
        # 生成安全的文件名
        safe_filename = re.sub(r'[<>:"/\\|?*]', '_', filename)
        if len(safe_filename) > 100:
            ext = safe_filename.rsplit('.', 1)[-1] if '.' in safe_filename else ''
            safe_filename = hashlib.md5(filename.encode()).hexdigest()[:12]
            if ext:
                safe_filename += '.' + ext
        
        return str(assets_dir / asset_type / safe_filename)
    
    def _guess_extension(self, url: str) -> str:
        """根据 URL 猜测扩展名"""
        url_lower = url.lower()
        if 'css' in url_lower:
            return '.css'
        elif 'js' in url_lower or 'javascript' in url_lower:
            return '.js'
        elif any(ext in url_lower for ext in ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']):
            for ext in ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']:
                if ext in url_lower:
                    return '.' + ext
        return '.bin'
    
    def _extract_urls_from_html(self, html: str, base_url: str) -> Set[str]:
        """从 HTML 中提取资源 URL"""
        if not BS4_AVAILABLE:
            raise ImportError("需要安装 beautifulsoup4: pip install beautifulsoup4")
        
        urls = set()
        soup = BeautifulSoup(html, 'html.parser')
        base_domain = urlparse(base_url).netloc
        
        # 提取各种资源
        # CSS 链接
        for link in soup.find_all('link', rel='stylesheet'):
            href = link.get('href')
            if href:
                urls.add(urljoin(base_url, href))
        
        # 其他 link 标签（favicon 等）
        for link in soup.find_all('link'):
            href = link.get('href')
            if href and link.get('rel') not in [['stylesheet']]:
                full_url = urljoin(base_url, href)
                urls.add(full_url)
        
        # JavaScript
        for script in soup.find_all('script', src=True):
            src = script.get('src')
            if src:
                urls.add(urljoin(base_url, src))
        
        # 图片
        for img in soup.find_all('img', src=True):
            src = img.get('src')
            if src and not src.startswith('data:'):
                urls.add(urljoin(base_url, src))
            # srcset
            srcset = img.get('srcset')
            if srcset:
                for item in srcset.split(','):
                    url = item.strip().split()[0]
                    if url and not url.startswith('data:'):
                        urls.add(urljoin(base_url, url))
        
        # 背景图和其他 style 属性
        for elem in soup.find_all(style=True):
            style = elem.get('style')
            css_urls = self._extract_urls_from_css(style, base_url)
            urls.update(css_urls)
        
        # style 标签
        for style_tag in soup.find_all('style'):
            if style_tag.string:
                css_urls = self._extract_urls_from_css(style_tag.string, base_url)
                urls.update(css_urls)
        
        # video/audio
        for media in soup.find_all(['video', 'audio']):
            src = media.get('src')
            if src:
                urls.add(urljoin(base_url, src))
            poster = media.get('poster')
            if poster:
                urls.add(urljoin(base_url, poster))
            for source in media.find_all('source'):
                src = source.get('src')
                if src:
                    urls.add(urljoin(base_url, src))
        
        # 过滤只保留同域资源
        filtered_urls = set()
        for url in urls:
            parsed = urlparse(url)
            if parsed.netloc == base_domain or not parsed.netloc:
                filtered_urls.add(url)
        
        return filtered_urls
    
    def _extract_urls_from_css(self, css_content: str, base_url: str) -> Set[str]:
        """从 CSS 中提取 url() 引用"""
        urls = set()
        pattern = r'url\(["\']?([^"\')\s]+)["\']?\)'
        matches = re.findall(pattern, css_content)
        
        for match in matches:
            if not match.startswith('data:'):
                urls.add(urljoin(base_url, match))
        
        return urls
    
    def _download_resource(self, url: str, local_path: str, referer: str = None) -> tuple:
        """下载单个资源（使用隐身模式避免反爬）"""
        try:
            from . import get
            
            # 使用隐身模式自动添加完整的浏览器请求头
            # 用户自定义的 Referer 会覆盖默认值
            extra_headers = {}
            if referer:
                extra_headers['Referer'] = referer
            
            # 检查是否是 VLESS 链接 - VLESS 不支持 HTTP 请求，只支持浏览器模式
            # 如果是 VLESS 链接，资源下载时不使用代理
            proxies_for_download = self.cf_proxies
            if self.cf_proxies and str(self.cf_proxies).lower().startswith('vless://'):
                proxies_for_download = None  # VLESS 链接不支持 HTTP 请求，直接下载
            
            response = get(
                url,
                cf_proxies=proxies_for_download,
                timeout=self.timeout,
                headers=extra_headers,
                stealth=True,  # 启用隐身模式，自动添加完整浏览器请求头
                stealth_browser='chrome'
            )
            
            if response.status_code == 200:
                content = response.content
                
                # 检测是否下载到了错误页面（HTML 而不是预期的资源）
                content_type = response.headers.get('content-type', '').lower()
                expected_type = self._get_asset_type(url)
                
                # 如果期望的是 JS/CSS 但得到了 HTML，可能是错误页面
                if expected_type in ['js', 'css'] and 'text/html' in content_type:
                    # 检查是否是 nginx 默认页面或其他错误页面
                    content_str = content.decode('utf-8', errors='ignore')[:500]
                    if 'nginx' in content_str.lower() or '<!doctype html>' in content_str.lower():
                        return (url, None, 0, f"下载到错误页面（可能是 CDN 保护）")
                
                # 创建目录
                os.makedirs(os.path.dirname(local_path), exist_ok=True)
                
                # 写入文件
                with open(local_path, 'wb') as f:
                    f.write(content)
                
                return (url, local_path, len(content), None)
            else:
                return (url, None, 0, f"HTTP {response.status_code}")
        except Exception as e:
            return (url, None, 0, str(e))
    
    def _rewrite_html(self, html: str, base_url: str, url_mapping: Dict[str, str], save_dir: Path) -> str:
        """重写 HTML 中的资源链接"""
        if not BS4_AVAILABLE:
            return html
        
        soup = BeautifulSoup(html, 'html.parser')
        
        def get_relative_path(local_path: str) -> str:
            """获取相对于 index.html 的路径"""
            try:
                rel_path = os.path.relpath(local_path, save_dir)
                return rel_path.replace('\\', '/')
            except:
                return local_path
        
        def replace_url(url: str) -> Optional[str]:
            """替换 URL 为本地路径"""
            full_url = urljoin(base_url, url)
            if full_url in url_mapping:
                return get_relative_path(url_mapping[full_url])
            return None
        
        # 替换 link href
        for link in soup.find_all('link', href=True):
            new_path = replace_url(link['href'])
            if new_path:
                link['href'] = new_path
        
        # 替换 script src
        for script in soup.find_all('script', src=True):
            new_path = replace_url(script['src'])
            if new_path:
                script['src'] = new_path
        
        # 替换 img src
        for img in soup.find_all('img', src=True):
            new_path = replace_url(img['src'])
            if new_path:
                img['src'] = new_path
        
        # 替换 video/audio
        for media in soup.find_all(['video', 'audio']):
            if media.get('src'):
                new_path = replace_url(media['src'])
                if new_path:
                    media['src'] = new_path
            if media.get('poster'):
                new_path = replace_url(media['poster'])
                if new_path:
                    media['poster'] = new_path
        
        # 替换 style 标签中的 url()
        for style_tag in soup.find_all('style'):
            if style_tag.string:
                new_css = self._rewrite_css(style_tag.string, base_url, url_mapping, save_dir)
                style_tag.string = new_css
        
        # 替换 style 属性中的 url()
        for elem in soup.find_all(style=True):
            style = elem.get('style')
            new_style = self._rewrite_css(style, base_url, url_mapping, save_dir)
            elem['style'] = new_style
        
        return str(soup)
    
    def _rewrite_css(self, css_content: str, base_url: str, url_mapping: Dict[str, str], save_dir: Path) -> str:
        """重写 CSS 中的 url() 引用"""
        def replace_url(match):
            url = match.group(1).strip('"\'')
            full_url = urljoin(base_url, url)
            if full_url in url_mapping:
                local_path = url_mapping[full_url]
                try:
                    rel_path = os.path.relpath(local_path, save_dir)
                    rel_path = rel_path.replace('\\', '/')
                    return f'url("{rel_path}")'
                except:
                    pass
            return match.group(0)
        
        pattern = r'url\(["\']?([^"\')\s]+)["\']?\)'
        return re.sub(pattern, replace_url, css_content)
    
    def _process_css_file(self, css_path: str, css_url: str, base_url: str, 
                          assets_dir: Path, url_mapping: Dict[str, str]) -> List[str]:
        """处理 CSS 文件，下载其中引用的资源"""
        new_urls = []
        
        try:
            with open(css_path, 'r', encoding='utf-8', errors='ignore') as f:
                css_content = f.read()
            
            # 提取 CSS 中的 URL
            css_base = css_url.rsplit('/', 1)[0] + '/'
            urls_in_css = self._extract_urls_from_css(css_content, css_base)
            
            for url in urls_in_css:
                if url not in url_mapping and url not in self._failed:
                    new_urls.append(url)
        except:
            pass
        
        return new_urls
    
    def mirror(self, url: str, save_dir: str = "./mirror", open_browser: bool = True) -> MirrorResult:
        """
        镜像网页到本地
        
        Args:
            url: 目标网页 URL
            save_dir: 保存目录
            open_browser: 是否自动打开浏览器预览
            
        Returns:
            MirrorResult: 镜像结果
        """
        if not BS4_AVAILABLE:
            raise ImportError("需要安装 beautifulsoup4: pip install beautifulsoup4")
        
        result = MirrorResult()
        save_path = Path(save_dir).resolve()
        assets_path = save_path / "assets"
        
        try:
            # 创建目录
            save_path.mkdir(parents=True, exist_ok=True)
            assets_path.mkdir(exist_ok=True)
            for asset_type in self.ASSET_TYPES.keys():
                (assets_path / asset_type).mkdir(exist_ok=True)
            
            # 使用浏览器渲染页面
            print(f"[Mirror] 正在渲染页面: {url}")
            browser = self._get_browser()
            html = browser.html(url)
            
            # 提取资源 URL
            print("[Mirror] 正在提取资源链接...")
            resource_urls = self._extract_urls_from_html(html, url)
            print(f"[Mirror] 发现 {len(resource_urls)} 个资源")
            
            # 并发下载资源
            url_mapping: Dict[str, str] = {}
            total_size = 0
            
            if resource_urls:
                print("[Mirror] 正在下载资源...")
                with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
                    futures = {}
                    for res_url in resource_urls:
                        local_path = self._generate_local_path(res_url, url, assets_path)
                        futures[executor.submit(self._download_resource, res_url, local_path, url)] = res_url
                    
                    completed = 0
                    for future in as_completed(futures):
                        res_url, local_path, size, error = future.result()
                        completed += 1
                        
                        if local_path:
                            url_mapping[res_url] = local_path
                            total_size += size
                            self._downloaded[res_url] = local_path
                        else:
                            self._failed.add(res_url)
                            result.failed_urls.append(f"{res_url}: {error}")
                        
                        # 进度显示
                        if completed % 10 == 0 or completed == len(futures):
                            print(f"[Mirror] 下载进度: {completed}/{len(futures)}")
            
            # 处理 CSS 文件中的额外资源
            css_files = [(path, u) for u, path in url_mapping.items() 
                        if path.endswith('.css')]
            
            additional_urls = set()
            for css_path, css_url in css_files:
                new_urls = self._process_css_file(css_path, css_url, url, assets_path, url_mapping)
                additional_urls.update(new_urls)
            
            # 下载 CSS 中发现的额外资源
            if additional_urls:
                print(f"[Mirror] 发现 CSS 中的 {len(additional_urls)} 个额外资源")
                with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
                    futures = {}
                    for res_url in additional_urls:
                        local_path = self._generate_local_path(res_url, url, assets_path)
                        futures[executor.submit(self._download_resource, res_url, local_path, url)] = res_url
                    
                    for future in as_completed(futures):
                        res_url, local_path, size, error = future.result()
                        if local_path:
                            url_mapping[res_url] = local_path
                            total_size += size
            
            # 重写 HTML 链接
            print("[Mirror] 正在重写资源链接...")
            rewritten_html = self._rewrite_html(html, url, url_mapping, save_path)
            
            # 重写 CSS 文件中的链接
            for css_path, css_url in css_files:
                try:
                    with open(css_path, 'r', encoding='utf-8', errors='ignore') as f:
                        css_content = f.read()
                    
                    css_base = css_url.rsplit('/', 1)[0] + '/'
                    new_css = self._rewrite_css(css_content, css_base, url_mapping, save_path)
                    
                    with open(css_path, 'w', encoding='utf-8') as f:
                        f.write(new_css)
                except:
                    pass
            
            # 保存 HTML
            index_file = save_path / "index.html"
            with open(index_file, 'w', encoding='utf-8') as f:
                f.write(rewritten_html)
            
            # 填充结果
            result.index_file = str(index_file)
            result.assets_dir = str(assets_path)
            result.total_files = len(url_mapping) + 1  # +1 for index.html
            result.total_size = total_size + len(rewritten_html.encode('utf-8'))
            result.success = True
            
            print(f"[Mirror] 镜像完成!")
            print(f"[Mirror] 保存位置: {index_file}")
            print(f"[Mirror] 总文件数: {result.total_files}")
            print(f"[Mirror] 总大小: {result.total_size / 1024:.2f} KB")
            if result.failed_urls:
                print(f"[Mirror] 失败资源: {len(result.failed_urls)} 个")
            
            # 自动打开浏览器
            if open_browser:
                print("[Mirror] 正在打开浏览器预览...")
                webbrowser.open(f"file://{index_file}")
            
        except Exception as e:
            result.success = False
            result.failed_urls.append(str(e))
            print(f"[Mirror] 错误: {e}")
        finally:
            self._close_browser()
        
        return result


def mirror(url: str, save_dir: str = "./mirror", open_browser: bool = True,
           cf_proxies: str = None, vless_uuid: str = None, 
           timeout: int = 30, max_workers: int = 10) -> MirrorResult:
    """
    镜像网页到本地
    
    爬取网页及其所有资源（CSS、JS、图片、字体等），
    保存到本地并自动打开浏览器预览。
    
    Args:
        url: 目标网页 URL
        save_dir: 保存目录，默认 "./mirror"
        open_browser: 是否自动打开浏览器预览，默认 True
        cf_proxies: 代理地址，支持 VLESS 链接/HTTP/SOCKS5
        vless_uuid: VLESS UUID（仅域名方式需要）
        timeout: 请求超时时间（秒），默认 30
        max_workers: 并发下载线程数，默认 10
        
    Returns:
        MirrorResult: 镜像结果，包含保存路径、文件数量等信息
        
    Examples:
        >>> import cfspider
        >>> 
        >>> # 基本用法
        >>> result = cfspider.mirror("https://example.com")
        >>> print(result.index_file)  # 保存的 HTML 路径
        >>> 
        >>> # 指定保存目录
        >>> result = cfspider.mirror(
        ...     "https://example.com",
        ...     save_dir="./my_mirror",
        ...     open_browser=False
        ... )
        >>> 
        >>> # 使用 VLESS 代理
        >>> result = cfspider.mirror(
        ...     "https://example.com",
        ...     cf_proxies="vless://uuid@host:443?path=/"
        ... )
    """
    mirrorer = WebMirror(
        cf_proxies=cf_proxies,
        vless_uuid=vless_uuid,
        timeout=timeout,
        max_workers=max_workers
    )
    return mirrorer.mirror(url, save_dir, open_browser)


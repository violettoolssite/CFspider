"""
CFspider 命令行工具

提供完整的命令行接口，支持：
- GET/POST/HEAD 等 HTTP 请求
- 批量 URL 请求
- 数据提取和导出
- VPN 代理模式
- 浏览器安装
- pip 源配置

用法示例：
    cfspider get https://example.com
    cfspider post https://api.example.com -d '{"key": "value"}'
    cfspider batch urls.txt --pick "title:h1" -o results.csv
    cfspider config pip  # 配置 pip 使用 cfspider 源
"""

import sys
import subprocess
import argparse
import json
import os
from pathlib import Path


# CFspider PyPI 镜像源
CFSPIDER_PIP_INDEX = "https://server.cfspider.com/simple/"
CFSPIDER_PIP_TRUSTED_HOST = "server.cfspider.com"


def configure_pip_source(global_config: bool = False) -> bool:
    """
    配置 pip 使用 CFspider 镜像源
    
    会自动在用户目录下创建 pip 配置文件，设置 CFspider 为默认源。
    
    Args:
        global_config: 是否配置全局（需要管理员权限）
        
    Returns:
        bool: 配置是否成功
        
    Example:
        >>> import cfspider
        >>> cfspider.configure_pip_source()
        True
    """
    try:
        # 确定配置文件路径
        if sys.platform == 'win32':
            # Windows: %APPDATA%\pip\pip.ini
            if global_config:
                pip_dir = Path(os.environ.get('ProgramData', 'C:\\ProgramData')) / 'pip'
            else:
                pip_dir = Path(os.environ.get('APPDATA', '')) / 'pip'
            config_file = pip_dir / 'pip.ini'
        else:
            # Linux/macOS: ~/.pip/pip.conf 或 ~/.config/pip/pip.conf
            if global_config:
                pip_dir = Path('/etc')
                config_file = pip_dir / 'pip.conf'
            else:
                pip_dir = Path.home() / '.pip'
                config_file = pip_dir / 'pip.conf'
        
        # 创建目录
        pip_dir.mkdir(parents=True, exist_ok=True)
        
        # 读取现有配置
        existing_config = ""
        if config_file.exists():
            existing_config = config_file.read_text(encoding='utf-8')
        
        # 检查是否已配置
        if CFSPIDER_PIP_INDEX in existing_config:
            print(f"CFspider pip 源已配置: {config_file}")
            return True
        
        # 生成新配置
        new_config = f"""[global]
index-url = {CFSPIDER_PIP_INDEX}
trusted-host = {CFSPIDER_PIP_TRUSTED_HOST}
extra-index-url = https://pypi.org/simple/

"""
        
        # 如果有现有配置，追加到后面（作为备注）
        if existing_config.strip():
            new_config += f"\n# === 原有配置 ===\n# {existing_config.replace(chr(10), chr(10) + '# ')}\n"
        
        # 写入配置
        config_file.write_text(new_config, encoding='utf-8')
        
        print(f"已配置 CFspider pip 源")
        print(f"配置文件: {config_file}")
        print(f"源地址: {CFSPIDER_PIP_INDEX}")
        print()
        print("现在可以直接使用 pip install 安装包：")
        print("  pip install cfspider")
        print("  pip install requests")
        print()
        print("或临时使用源：")
        print(f"  pip install -i {CFSPIDER_PIP_INDEX} cfspider")
        
        return True
        
    except PermissionError:
        print("错误: 权限不足，请使用管理员权限运行", file=sys.stderr)
        if sys.platform == 'win32':
            print("提示: 右键点击命令提示符，选择「以管理员身份运行」", file=sys.stderr)
        else:
            print("提示: 使用 sudo cfspider config pip --global", file=sys.stderr)
        return False
    except Exception as e:
        print(f"配置失败: {e}", file=sys.stderr)
        return False


def show_pip_config() -> None:
    """显示当前 pip 配置"""
    if sys.platform == 'win32':
        config_paths = [
            Path(os.environ.get('APPDATA', '')) / 'pip' / 'pip.ini',
            Path(os.environ.get('ProgramData', 'C:\\ProgramData')) / 'pip' / 'pip.ini',
        ]
    else:
        config_paths = [
            Path.home() / '.pip' / 'pip.conf',
            Path.home() / '.config' / 'pip' / 'pip.conf',
            Path('/etc/pip.conf'),
        ]
    
    found = False
    for path in config_paths:
        if path.exists():
            print(f"配置文件: {path}")
            print("-" * 40)
            print(path.read_text(encoding='utf-8'))
            print()
            found = True
    
    if not found:
        print("未找到 pip 配置文件")
        print()
        print("运行以下命令配置 CFspider 源：")
        print("  cfspider config pip")


def reset_pip_config() -> bool:
    """重置 pip 配置（移除 CFspider 源）"""
    try:
        if sys.platform == 'win32':
            config_file = Path(os.environ.get('APPDATA', '')) / 'pip' / 'pip.ini'
        else:
            config_file = Path.home() / '.pip' / 'pip.conf'
        
        if config_file.exists():
            content = config_file.read_text(encoding='utf-8')
            if CFSPIDER_PIP_INDEX in content:
                # 删除配置文件
                config_file.unlink()
                print(f"已移除 CFspider pip 配置: {config_file}")
                return True
            else:
                print("当前配置不是 CFspider 源，未做修改")
                return False
        else:
            print("未找到 pip 配置文件")
            return False
    except Exception as e:
        print(f"重置失败: {e}", file=sys.stderr)
        return False


def install_browser():
    """
    安装 Chromium 浏览器
    
    Example:
        >>> import cfspider
        >>> cfspider.install_browser()
    """
    try:
        # 使用 playwright 命令行安装
        result = subprocess.run(
            [sys.executable, '-m', 'playwright', 'install', 'chromium'],
            capture_output=False
        )
        return result.returncode == 0
    except Exception as e:
        print(f"安装失败: {e}")
        return False


def cmd_get(args):
    """执行 GET 请求"""
    from . import api
    
    # 解析请求头
    headers = {}
    if args.header:
        for h in args.header:
            if ':' in h:
                key, value = h.split(':', 1)
                headers[key.strip()] = value.strip()
    
    try:
        response = api.get(
            args.url,
            cf_proxies=args.proxy,
            token=args.token,
            impersonate=args.impersonate,
            stealth=args.stealth,
            stealth_browser=args.stealth_browser or 'chrome',
            headers=headers if headers else None,
            timeout=args.timeout,
        )
        
        # 输出结果
        _output_response(response, args)
        
    except Exception as e:
        print(f"请求失败: {e}", file=sys.stderr)
        sys.exit(1)


def cmd_post(args):
    """执行 POST 请求"""
    from . import api
    
    # 解析请求头
    headers = {}
    if args.header:
        for h in args.header:
            if ':' in h:
                key, value = h.split(':', 1)
                headers[key.strip()] = value.strip()
    
    # 解析数据
    data = None
    json_data = None
    
    if args.data:
        # 尝试解析为 JSON
        try:
            json_data = json.loads(args.data)
        except json.JSONDecodeError:
            data = args.data
    
    if args.form:
        # 表单数据
        data = {}
        for item in args.form.split('&'):
            if '=' in item:
                key, value = item.split('=', 1)
                data[key] = value
    
    try:
        response = api.post(
            args.url,
            cf_proxies=args.proxy,
            token=args.token,
            impersonate=args.impersonate,
            stealth=args.stealth,
            stealth_browser=args.stealth_browser or 'chrome',
            headers=headers if headers else None,
            data=data,
            json=json_data,
            timeout=args.timeout,
        )
        
        # 输出结果
        _output_response(response, args)
        
    except Exception as e:
        print(f"请求失败: {e}", file=sys.stderr)
        sys.exit(1)


def cmd_head(args):
    """执行 HEAD 请求"""
    from . import api
    
    headers = {}
    if args.header:
        for h in args.header:
            if ':' in h:
                key, value = h.split(':', 1)
                headers[key.strip()] = value.strip()
    
    try:
        response = api.head(
            args.url,
            cf_proxies=args.proxy,
            token=args.token,
            impersonate=args.impersonate,
            stealth=args.stealth,
            headers=headers if headers else None,
            timeout=args.timeout,
        )
        
        # HEAD 请求只输出响应头
        print(f"HTTP {response.status_code}")
        for key, value in response.headers.items():
            print(f"{key}: {value}")
        
        if response.cf_colo:
            print(f"\nCF-Colo: {response.cf_colo}")
        if response.cf_ray:
            print(f"CF-Ray: {response.cf_ray}")
        
    except Exception as e:
        print(f"请求失败: {e}", file=sys.stderr)
        sys.exit(1)


def cmd_batch(args):
    """执行批量请求"""
    from .batch import batch
    
    # 解析 URL 列表
    if args.urls:
        # 从命令行参数获取 URL
        urls = args.urls
    else:
        # 从文件读取
        print("错误: 必须提供 URL 列表或文件", file=sys.stderr)
        sys.exit(1)
    
    # 解析 pick 规则
    pick = None
    if args.pick:
        pick = {}
        for rule in args.pick:
            if ':' in rule:
                name, selector = rule.split(':', 1)
                # 检查是否有属性指定 (selector@attr)
                if '@' in selector:
                    sel, attr = selector.rsplit('@', 1)
                    pick[name] = (sel, attr)
                else:
                    pick[name] = selector
    
    try:
        results = batch(
            urls=urls,
            pick=pick,
            concurrency=args.concurrency,
            delay=args.delay,
            retry=args.retry,
            timeout=args.timeout,
            cf_proxies=args.proxy,
            token=args.token,
            impersonate=args.impersonate,
            stealth=args.stealth,
            progress=not args.quiet,
        )
        
        # 输出摘要
        if not args.quiet:
            summary = results.summary()
            print(f"\n完成: {summary['successful']}/{summary['total']} 成功 "
                  f"({summary['success_rate']}), 耗时 {summary['total_duration']}")
        
        # 保存结果
        if args.output:
            filepath = results.save(args.output)
            if not args.quiet:
                print(f"结果已保存到: {filepath}")
        else:
            # 输出到标准输出
            print(json.dumps(results.to_list(), ensure_ascii=False, indent=2))
        
    except Exception as e:
        print(f"批量请求失败: {e}", file=sys.stderr)
        sys.exit(1)


def _output_response(response, args):
    """输出响应结果"""
    # 数据提取
    if args.pick:
        pick = {}
        for rule in args.pick:
            if ':' in rule:
                name, selector = rule.split(':', 1)
                if '@' in selector:
                    sel, attr = selector.rsplit('@', 1)
                    pick[name] = (sel, attr)
                else:
                    pick[name] = selector
        
        data = response.pick(**pick)
        
        if args.output:
            data.save(args.output)
            print(f"结果已保存到: {args.output}")
        else:
            print(json.dumps(dict(data), ensure_ascii=False, indent=2))
    
    else:
        # 直接输出响应
        if args.output:
            response.save(args.output)
            print(f"响应已保存到: {args.output}")
        else:
            # 输出响应信息
            if args.verbose:
                print(f"HTTP {response.status_code}")
                for key, value in response.headers.items():
                    print(f"{key}: {value}")
                print()
            
            # 输出响应体
            try:
                # 尝试格式化 JSON
                data = response.json()
                print(json.dumps(data, ensure_ascii=False, indent=2))
            except:
                print(response.text)
            
            # 输出 CF 信息
            if args.verbose and response.cf_colo:
                print(f"\n[CF-Colo: {response.cf_colo}]")


def cmd_vpn(args):
    """VPN 代理命令"""
    if args.vpn_command == 'start':
        from .vless_client import start_socks5_proxy
        
        print(f"启动 SOCKS5 代理服务器...")
        print(f"Workers URL: {args.workers_url}")
        print(f"本地端口: {args.port}")
        print(f"监听地址: 127.0.0.1:{args.port}")
        print()
        print("使用方法:")
        print(f"  - 设置系统代理为 SOCKS5://127.0.0.1:{args.port}")
        print(f"  - 或使用浏览器扩展如 SwitchyOmega")
        print()
        print("按 Ctrl+C 停止服务")
        
        try:
            start_socks5_proxy(
                workers_url=args.workers_url,
                local_port=args.port,
                token=args.token
            )
        except KeyboardInterrupt:
            print("\n代理服务已停止")
    else:
        print("未知的 VPN 子命令")
        sys.exit(1)


def cmd_config(args):
    """配置命令"""
    if args.config_type == 'pip':
        if args.show:
            show_pip_config()
        elif args.reset:
            reset_pip_config()
        else:
            configure_pip_source(global_config=args.config_global)
    else:
        print("可用的配置选项：")
        print("  cfspider config pip        配置 pip 使用 CFspider 源")
        print("  cfspider config pip --show 显示当前 pip 配置")
        print("  cfspider config pip --reset 重置 pip 配置")
        sys.exit(1)


def main():
    """命令行入口"""
    parser = argparse.ArgumentParser(
        description='CFspider - Cloudflare 代理 IP 池',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
    cfspider get https://httpbin.org/ip
    cfspider get https://example.com --proxy https://workers.dev --pick "title:h1"
    cfspider post https://api.example.com -d '{"key": "value"}'
    cfspider batch urls.txt --pick "title:h1" "links:a@href" -o results.csv
    cfspider vpn start --workers-url https://your.workers.dev --port 1080

更多信息: https://www.cfspider.com
"""
    )
    
    subparsers = parser.add_subparsers(dest='command', help='可用命令')
    
    # ===== install 命令 =====
    install_parser = subparsers.add_parser('install', help='安装 Chromium 浏览器')
    
    # ===== version 命令 =====
    version_parser = subparsers.add_parser('version', help='显示版本号')
    
    # ===== 通用请求参数 =====
    def add_common_args(p):
        p.add_argument('-H', '--header', action='append', metavar='HEADER',
                       help='请求头 (如 "User-Agent: Mozilla/5.0")')
        p.add_argument('--proxy', metavar='URL',
                       help='Workers 代理地址')
        p.add_argument('--token', metavar='TOKEN',
                       help='鉴权 token')
        p.add_argument('--impersonate', metavar='BROWSER',
                       help='TLS 指纹模拟 (如 chrome131)')
        p.add_argument('--stealth', action='store_true',
                       help='启用隐身模式')
        p.add_argument('--stealth-browser', metavar='BROWSER',
                       help='隐身模式浏览器类型')
        p.add_argument('--timeout', type=float, default=30,
                       help='超时时间（秒）')
        p.add_argument('--pick', action='append', metavar='RULE',
                       help='数据提取规则 (如 "title:h1")')
        p.add_argument('-o', '--output', metavar='FILE',
                       help='输出文件')
        p.add_argument('-v', '--verbose', action='store_true',
                       help='显示详细信息')
    
    # ===== get 命令 =====
    get_parser = subparsers.add_parser('get', help='发送 GET 请求')
    get_parser.add_argument('url', help='目标 URL')
    add_common_args(get_parser)
    
    # ===== post 命令 =====
    post_parser = subparsers.add_parser('post', help='发送 POST 请求')
    post_parser.add_argument('url', help='目标 URL')
    post_parser.add_argument('-d', '--data', metavar='DATA',
                             help='POST 数据 (JSON 或字符串)')
    post_parser.add_argument('-f', '--form', metavar='DATA',
                             help='表单数据 (如 "name=test&age=20")')
    add_common_args(post_parser)
    
    # ===== head 命令 =====
    head_parser = subparsers.add_parser('head', help='发送 HEAD 请求')
    head_parser.add_argument('url', help='目标 URL')
    add_common_args(head_parser)
    
    # ===== batch 命令 =====
    batch_parser = subparsers.add_parser('batch', help='批量请求')
    batch_parser.add_argument('urls', nargs='*', help='URL 列表或文件路径')
    batch_parser.add_argument('--concurrency', '-c', type=int, default=5,
                              help='并发数 (默认 5)')
    batch_parser.add_argument('--delay', type=float, default=0,
                              help='请求间隔（秒）')
    batch_parser.add_argument('--retry', type=int, default=0,
                              help='失败重试次数')
    batch_parser.add_argument('-q', '--quiet', action='store_true',
                              help='安静模式，不显示进度')
    add_common_args(batch_parser)
    
    # ===== vpn 命令 =====
    vpn_parser = subparsers.add_parser('vpn', help='VPN 代理模式')
    vpn_subparsers = vpn_parser.add_subparsers(dest='vpn_command')
    
    vpn_start = vpn_subparsers.add_parser('start', help='启动 SOCKS5 代理')
    vpn_start.add_argument('--workers-url', required=True,
                           help='Workers URL')
    vpn_start.add_argument('--port', type=int, default=1080,
                           help='本地端口 (默认 1080)')
    vpn_start.add_argument('--token',
                           help='鉴权 token')
    
    # ===== config 命令 =====
    config_parser = subparsers.add_parser('config', help='配置管理')
    config_parser.add_argument('config_type', nargs='?', default=None,
                               choices=['pip'],
                               help='配置类型: pip')
    config_parser.add_argument('--show', action='store_true',
                               help='显示当前配置')
    config_parser.add_argument('--reset', action='store_true',
                               help='重置配置')
    config_parser.add_argument('--global', dest='config_global', action='store_true',
                               help='全局配置（需要管理员权限）')
    
    # 解析参数
    args = parser.parse_args()
    
    if not args.command:
        print_help()
        return
    
    if args.command == 'install':
        print("正在安装 Chromium 浏览器...")
        if install_browser():
            print("安装完成!")
        else:
            print("安装失败，请检查网络连接或手动安装")
            sys.exit(1)
    
    elif args.command == 'version':
        from . import __version__
        print(f"cfspider {__version__}")
    
    elif args.command == 'get':
        cmd_get(args)
    
    elif args.command == 'post':
        cmd_post(args)
    
    elif args.command == 'head':
        cmd_head(args)
    
    elif args.command == 'batch':
        cmd_batch(args)
    
    elif args.command == 'vpn':
        cmd_vpn(args)
    
    elif args.command == 'config':
        cmd_config(args)
    
    else:
        parser.print_help()
        sys.exit(1)


def print_help():
    """打印帮助信息"""
    print("""
CFspider - Cloudflare 代理 IP 池

用法:
    cfspider <command> [options]

命令:
    get <url>       发送 GET 请求
    post <url>      发送 POST 请求
    head <url>      发送 HEAD 请求
    batch <urls>    批量请求多个 URL
    vpn start       启动 SOCKS5 代理服务器
    config pip      配置 pip 使用 CFspider 源
    install         安装 Chromium 浏览器
    version         显示版本号

通用选项:
    -H, --header    添加请求头
    --proxy         Workers 代理地址
    --token         鉴权 token
    --impersonate   TLS 指纹模拟
    --stealth       启用隐身模式
    --pick          数据提取规则
    -o, --output    输出文件

示例:
    cfspider get https://httpbin.org/ip
    cfspider get https://example.com --pick "title:h1" -o data.json
    cfspider batch url1 url2 url3 --pick "title:h1" -o results.csv
    cfspider vpn start --workers-url https://your.workers.dev
    cfspider config pip  # 配置 pip 使用 CFspider 镜像源

pip 镜像源:
    pip install -i https://server.cfspider.com/simple/ cfspider

更多信息请访问: https://www.cfspider.com
""")


if __name__ == '__main__':
    main()

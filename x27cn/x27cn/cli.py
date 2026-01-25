"""
X27CN 命令行工具

用法:
    x27cn encrypt <file> [output] [--key=密钥]
    x27cn decrypt <file> [output] [--key=密钥]
    x27cn obfuscate <file> [output] [--key=密钥]
    x27cn minify <file> [output] [--no-mangle] [--no-node]
    x27cn flatten <file> [output] [--intensity=2] [--safe]
    x27cn password hash <password>
    x27cn password verify <password> <hash>
    x27cn password generate [--length=16]
    x27cn password check <password>
"""

import argparse
import sys
from .core import encrypt, decrypt, DEFAULT_KEY
from .obfuscate import obfuscate_file
from .minify import minify_file, obfuscate_identifiers, add_dead_code, flatten_control_flow, flatten_control_flow_safe
from .password import (
    hash_password, verify_password, generate_password,
    check_password_strength, encrypt_with_password, decrypt_with_password
)


def main():
    parser = argparse.ArgumentParser(
        prog='x27cn',
        description='X27CN 代码混淆加密工具'
    )
    parser.add_argument('--version', action='version', version='x27cn 1.3.0')
    
    subparsers = parser.add_subparsers(dest='command', help='命令')
    
    # encrypt 命令
    enc_parser = subparsers.add_parser('encrypt', help='加密文本或文件')
    enc_parser.add_argument('input', help='输入文件或文本')
    enc_parser.add_argument('output', nargs='?', help='输出文件（可选）')
    enc_parser.add_argument('--key', '-k', default=DEFAULT_KEY, help='加密密钥')
    enc_parser.add_argument('--text', '-t', action='store_true', help='将 input 作为文本而非文件')
    enc_parser.add_argument('--password', '-p', help='使用密码加密（更安全）')
    
    # decrypt 命令
    dec_parser = subparsers.add_parser('decrypt', help='解密文本或文件')
    dec_parser.add_argument('input', help='输入文件或加密文本')
    dec_parser.add_argument('output', nargs='?', help='输出文件（可选）')
    dec_parser.add_argument('--key', '-k', default=DEFAULT_KEY, help='解密密钥')
    dec_parser.add_argument('--text', '-t', action='store_true', help='将 input 作为文本而非文件')
    dec_parser.add_argument('--password', '-p', help='使用密码解密')
    
    # obfuscate 命令
    obf_parser = subparsers.add_parser('obfuscate', help='混淆加密文件（生成自解密代码）')
    obf_parser.add_argument('input', help='输入文件 (.html/.js/.css)')
    obf_parser.add_argument('output', nargs='?', help='输出文件（可选）')
    obf_parser.add_argument('--key', '-k', default=DEFAULT_KEY, help='加密密钥')
    
    # minify 命令
    min_parser = subparsers.add_parser('minify', help='压缩混淆文件（不加密）')
    min_parser.add_argument('input', help='输入文件 (.html/.js/.css)')
    min_parser.add_argument('output', nargs='?', help='输出文件（可选）')
    min_parser.add_argument('--no-mangle', action='store_true', help='不混淆变量名')
    min_parser.add_argument('--no-node', action='store_true', help='不使用 Node.js 工具')
    min_parser.add_argument('--dead-code', type=int, default=0, help='添加死代码复杂度 (1-5)')
    min_parser.add_argument('--identifiers', action='store_true', help='额外混淆标识符')
    
    # flatten 命令
    flat_parser = subparsers.add_parser('flatten', help='控制流扁平化混淆（仅JS）')
    flat_parser.add_argument('input', help='输入 JavaScript 文件')
    flat_parser.add_argument('output', nargs='?', help='输出文件（可选）')
    flat_parser.add_argument('--intensity', '-i', type=int, default=2, choices=[1, 2, 3], 
                            help='扁平化强度 (1=轻, 2=中, 3=强)')
    flat_parser.add_argument('--safe', '-s', action='store_true', help='使用安全模式（更保守）')
    
    # password 命令
    pwd_parser = subparsers.add_parser('password', help='密码工具')
    pwd_subparsers = pwd_parser.add_subparsers(dest='pwd_command', help='密码子命令')
    
    # password hash
    pwd_hash = pwd_subparsers.add_parser('hash', help='哈希密码')
    pwd_hash.add_argument('password', help='要哈希的密码')
    pwd_hash.add_argument('--iterations', '-i', type=int, default=100000, help='迭代次数')
    
    # password verify
    pwd_verify = pwd_subparsers.add_parser('verify', help='验证密码')
    pwd_verify.add_argument('password', help='明文密码')
    pwd_verify.add_argument('hash', help='哈希值')
    
    # password generate
    pwd_gen = pwd_subparsers.add_parser('generate', help='生成随机密码')
    pwd_gen.add_argument('--length', '-l', type=int, default=16, help='密码长度')
    pwd_gen.add_argument('--no-special', action='store_true', help='不包含特殊字符')
    pwd_gen.add_argument('--count', '-c', type=int, default=1, help='生成数量')
    
    # password check
    pwd_check = pwd_subparsers.add_parser('check', help='检查密码强度')
    pwd_check.add_argument('password', help='要检查的密码')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        sys.exit(0)
    
    try:
        if args.command == 'encrypt':
            if args.text:
                if args.password:
                    result = encrypt_with_password(args.input, args.password)
                else:
                    result = encrypt(args.input, args.key)
                print(result)
            else:
                with open(args.input, 'r', encoding='utf-8') as f:
                    content = f.read()
                if args.password:
                    result = encrypt_with_password(content, args.password)
                else:
                    result = encrypt(content, args.key)
                if args.output:
                    with open(args.output, 'w', encoding='utf-8') as f:
                        f.write(result)
                    print(f'加密完成: {args.output}')
                else:
                    print(result)
        
        elif args.command == 'decrypt':
            if args.text:
                if args.password:
                    result = decrypt_with_password(args.input, args.password)
                else:
                    result = decrypt(args.input, args.key)
                print(result)
            else:
                with open(args.input, 'r', encoding='utf-8') as f:
                    content = f.read()
                if args.password:
                    result = decrypt_with_password(content, args.password)
                else:
                    result = decrypt(content, args.key)
                if args.output:
                    with open(args.output, 'w', encoding='utf-8') as f:
                        f.write(result)
                    print(f'解密完成: {args.output}')
                else:
                    print(result)
        
        elif args.command == 'obfuscate':
            output = obfuscate_file(args.input, args.output, args.key)
            print(f'混淆完成: {output}')
        
        elif args.command == 'minify':
            output = minify_file(
                args.input, 
                args.output, 
                use_node=not args.no_node,
                mangle=not args.no_mangle
            )
            # 后处理
            if args.dead_code > 0 or args.identifiers:
                with open(output, 'r', encoding='utf-8') as f:
                    content = f.read()
                if args.identifiers and output.endswith('.js'):
                    content = obfuscate_identifiers(content)
                if args.dead_code > 0 and output.endswith('.js'):
                    content = add_dead_code(content, args.dead_code)
                with open(output, 'w', encoding='utf-8') as f:
                    f.write(content)
            print(f'压缩完成: {output}')
        
        elif args.command == 'flatten':
            with open(args.input, 'r', encoding='utf-8') as f:
                content = f.read()
            
            if args.safe:
                result = flatten_control_flow_safe(content)
            else:
                result = flatten_control_flow(content, intensity=args.intensity)
            
            import os
            if args.output:
                output_path = args.output
            else:
                base, ext = os.path.splitext(args.input)
                output_path = f"{base}.flat{ext}"
            
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(result)
            print(f'控制流扁平化完成: {output_path}')
        
        elif args.command == 'password':
            if args.pwd_command == 'hash':
                hashed = hash_password(args.password, iterations=args.iterations)
                print(hashed)
            
            elif args.pwd_command == 'verify':
                if verify_password(args.password, args.hash):
                    print('✓ 密码正确')
                else:
                    print('✗ 密码错误')
                    sys.exit(1)
            
            elif args.pwd_command == 'generate':
                for _ in range(args.count):
                    pwd = generate_password(
                        length=args.length,
                        include_special=not args.no_special
                    )
                    print(pwd)
            
            elif args.pwd_command == 'check':
                result = check_password_strength(args.password)
                level_colors = {
                    'weak': '🔴',
                    'fair': '🟠',
                    'good': '🟡',
                    'strong': '🟢',
                    'excellent': '💚'
                }
                print(f"{level_colors.get(result['level'], '')} 强度: {result['level'].upper()} ({result['score']}/100)")
                print(f"  长度: {result['length']} 字符")
                print(f"  小写: {'✓' if result['has_lower'] else '✗'}")
                print(f"  大写: {'✓' if result['has_upper'] else '✗'}")
                print(f"  数字: {'✓' if result['has_digit'] else '✗'}")
                print(f"  特殊字符: {'✓' if result['has_special'] else '✗'}")
                if result['suggestions']:
                    print("\n建议:")
                    for s in result['suggestions']:
                        print(f"  - {s}")
            else:
                pwd_parser.print_help()
    
    except FileNotFoundError:
        print(f'错误: 文件不存在 - {args.input}', file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f'错误: {e}', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()


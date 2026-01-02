from setuptools import setup, find_packages

setup(
    name="cfspider",
    version="1.0.0",
    description="Cloudflare Workers 代理请求库，语法与 requests 一致",
    author="CFspider",
    packages=find_packages(),
    install_requires=[
        "requests>=2.20.0",
    ],
    python_requires=">=3.7",
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
    ],
)


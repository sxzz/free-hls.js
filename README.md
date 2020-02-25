# free-hls.js

一个用 Node.js 写的 Free-HLS 上传客户端

参考代码和转码参数均~~抄~~来自于 [sxyazi/free-hls](https://github.com/sxyazi/free-hls)。

详细使用方法请参考上述链接。

**本项目仅供学习交流使用，在使用过程中对你或他人造成的任何损失我们概不负责。**

## Requirements
- NodeJS
- Yarn
- FFmpeg

## Installation

*Only tested on macOS with FFmpeg v4.2.2*

```bash
git clone https://github.com/sxzz/free-hls.js.git
cd free-hls.js
yarn install
yarn upload <file> [title] [segment_time|LIMITED]
```

## Usage 

```bash
yarn upload test.mp4               # 默认标题，取自文件名
yarn upload test.mp4 my_title      # 自定义标题
yarn upload test.mp4 test 5        # 自定义分段大小
yarn upload test.mp4 test LIMITED  # 限制码率（需重编码）
```

## Related

- [sxzz/free-hls-live](https://github.com/sxzz/free-hls-live) HLS 直播姬
- [sxyazi/free-hls](https://github.com/sxyazi/free-hls) 一个免费的 HLS 解决方案

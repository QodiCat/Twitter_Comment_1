# 轻评 · X 智能评论

基于 Manifest V3 的 Chrome / Edge 浏览器扩展。在推文下方点击「✦ 智能评论」，选择提示词模板，生成 3–5 条候选，再填入对应回复框。发布前可以继续编辑，插件不会点击发布按钮。

## 安装与首次使用

1. Chrome 打开 `chrome://extensions`；Edge 打开 `edge://extensions`。
2. 开启「开发者模式」，点击「加载已解压的扩展程序」。
3. 选择本项目目录（包含 `manifest.json` 的目录）。也可以先解压 `dist/qingping-1.0.0.zip`，选择解压后的目录。
4. 点击扩展图标打开设置，选择服务、填写账号可用的模型 ID 和 API Key，然后保存。允许访问你配置的 API 网站。
5. 可点击「测试已保存连接」验证配置，会调用一次真实模型 API 并按服务商规则计费。
6. 打开或刷新 `https://x.com` / `https://twitter.com`，在目标推文下方点击「智能评论」。先检查侧栏中的目标文字，再选择风格并生成。
7. 点击「填入回复」，在原生回复框中确认或修改，再自行发布。也可复制候选评论。

首次加载、更新或重载扩展后，已打开的 X 标签页需要刷新。无需构建、npm 或中转服务器即可安装使用。

## 支持的连接

| 服务 | 默认 API 基础地址 | 协议 |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | Chat Completions |
| Claude | `https://api.anthropic.com/v1` | Messages |
| Kimi / Moonshot | `https://api.moonshot.cn/v1` | Chat Completions |
| 自定义 | 用户填写 HTTPS 基础地址 | OpenAI 兼容 Chat Completions |

模型 ID 不预设，填写服务控制台中对你的账号开放的模型。Kimi 国际站账号应按控制台文档修改基础地址。接口地址不要带 `/chat/completions` 或 `/messages`，插件会根据协议追加路径。自定义接口须接受标准 messages 请求并返回相应响应结构；模型需遵循 JSON 输出指令。

## 功能

- 自动识别时间线中的文字推文；滚动加载后补充按钮，避免重复注入。
- 支持选中文字后右键「轻评：为选中文字生成评论」。无法可靠关联到推文时只提供复制。
- 内置自然交流、幽默风趣、简短肯定、Web3 观察者四套模板，可增删、编辑、设置默认，最多 30 套。
- 生成 3、4 或 5 条评论，支持跟随原文、中文或英文。
- 生成时显示加载状态；关闭面板或更换目标会取消旧请求。请求超时为 25 秒，可手动重试。
- 返回内容按纯文本展示，校验数量、长度和重复项，不把模型内容当 HTML 执行。
- 填入前核对目标回复窗口；有已有编辑窗口、已有文字草稿或目标无法确认时保留现场，提示复制手动填写。

## 隐私和权限

- 无埋点、遥测或中转服务器。不读取账号密码，不自动点赞、关注或发布。
- 仅在用户点击生成时，将目标推文文字、所选模板和偏好发送到用户配置的模型 API。模型服务会按其自己的政策处理数据。
- API Key 使用 Web Crypto AES-256-GCM 加密后保存到 `chrome.storage.local`；不可导出的设备 CryptoKey 保存在扩展来源的 IndexedDB，不使用同步存储。每次加密使用随机 IV，密文绑定服务和基础地址。
- 密钥明文仅在设置输入框与后台请求内存中短暂存在。内容脚本无法读取扩展 local 存储，后台不会向其返回密钥或密文。只有设置页可以保存/删除密钥。
- 本地加密无法防御已控制本机、浏览器或扩展执行环境的攻击者；它不是独立口令保险库。卸载扩展会清除扩展本地数据。不要把浏览器配置目录当作密钥备份。
- 更换模型服务或基础地址时，旧密钥不会自动发送至新地址，需要重新填写。仅更换模型 ID 可保留密钥。
- 必需权限：`storage` 保存配置、`contextMenus` 提供选中文字入口。内容脚本仅匹配 X/Twitter。可选的 HTTPS 主机权限在保存时只请求配置的 API 来源；清除密钥不会撤回已经授予的网站权限，可在扩展管理页管理权限。

## 验证与打包

开发验证使用 Node.js 22 或更高版本；测试依赖不随插件分发。

```sh
npm ci
npm run check
npm test
npm run package
```

测试包含接口与异常模拟、AES-GCM/IndexedDB、消息权限、取消请求、模拟推文 DOM、草稿保护和设置页交互。所有自动化测试使用假密钥和模拟响应，不访问真实模型或发布内容。ZIP 仅包含运行文件和本文档。

### 仍需在你的环境验收

- 分别在 Chrome / Edge 加载扩展并保存真实 Key，检查权限弹窗、扩展控制台和连接测试。
- 在已登录 X 上检查首页、详情页、滚动加载、右键选区及原生编辑器输入同步；每次确认回复对象正确，且草稿可修改。
- 验证已有草稿、回复受限、纯图片推文、取消请求、无效 Key 和撤回 API 网站权限的提示。

自动化 DOM 测试不等同于真实 X / React 编辑器验收。X 会变更 DOM，若页面不兼容，插件会提示复制手动回复，不退回到向任意输入框写入。只读取页面当前已显示的推文文字，不抓取展开外的全文、不读取图片或视频、不打开外部文章。

## 文件说明

`background.js`：权限边界、存储、请求管理与右键菜单；`core.js`：配置校验与模型适配；`vault.js`：加密与设备密钥；`tweet-dom.js`：目标识别和填入；`content.js`：动态按钮与隔离侧栏；`options.html/js`、`styles.css`：设置页；`tests/`：离线自动化测试。

接口依据：[OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)、[Claude Messages](https://platform.claude.com/docs/en/api/messages/create)、[Kimi Chat Completions](https://platform.kimi.ai/docs/api/chat)、[Chrome Storage](https://developer.chrome.com/docs/extensions/reference/api/storage)、[Chrome Permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions)。

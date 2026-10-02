# Project Context · 轻评

## 项目简介
- 原生 JavaScript / HTML / CSS 的 Chrome、Edge Manifest V3 扩展，为 X/Twitter 生成评论草稿。
- 工程事实以代码、配置、测试为准；本文件是唯一 Agent 工程入口，细节按下方索引阅读。
- 产品入口见 [.product/README.md](.product/README.md)；产品任务遵循 [.product/start-prompt.md](.product/start-prompt.md)。
- 原始 `需求.md` 尚未整理成版本化功能包；不因代码存在就认定需求完成或 PRD 已批准。

## 真实命令
命令来源：`package.json`、`package-lock.json`、`manifest.json`、`scripts/`；当前无 CI 配置。

| 用途 | 命令 / 入口 |
| --- | --- |
| 安装开发依赖 | `npm ci`（有锁文件；无自定义 install 脚本；运行扩展无需依赖安装） |
| dev | 无；浏览器开发者模式加载本目录，修改后重新加载扩展并刷新 X 页面 |
| test | `npm test` → `node --test tests/*.test.js` |
| lint | 无；不能把 check 称为完整 lint |
| check | `npm run check` → `node scripts/check.mjs` |
| build | 无；原生源码直接加载 |
| 打包 | `npm run package` → `node scripts/package.mjs` |
| 发布 / 部署 | 无自动化命令；手动加载解压目录，未建立商店发布流程 |

开发工具验证环境：Node 24.8.0、npm 11.6.0；项目未声明 engines，依赖约束见测试文档。

## 全局规则
- 单个源码文件原则上不超过 500 行；接近时按职责拆分，自动生成文件除外。
- 一个目录只负责一个业务领域，禁止膨胀 `utils`、`common`、`helper`、`misc` 万能目录。
- 一个模块只负责一个职责；先搜索并扩展现有实现，不创建平行模块或重复能力。
- 修改代码时同步清理废弃代码、无用配置和失效兼容逻辑，不长期保留 Dead Code。
- 统一使用 `.env` 与 `.env.example` 管理运行配置；禁止硬编码环境变量、URL、端口、Token、密钥和业务时限。
- 不使用长期 Mock、Fake Data、过度兜底、静默降级、吞异常或默认成功掩盖问题；优先暴露真实问题并修复根因。
- 修改功能时同步更新测试和相关上下文文档；不通过删除测试、降低断言或绕过 CI 解决问题。
- 现有实现与上述约束的差异记录在工程债务文档；初始化不据此改业务代码，也不把差异当作永久豁免。
- 工程现状与已批准产品目标分别记录；未批准文档不能触发实现变更。PRD 批准必须有用户明确确认。
- 不回滚或覆盖进入任务前已有的未提交改动；不输出真实密钥，不把用户密钥打包进扩展。

## 工程专题索引
- [.agents/architecture.md](.agents/architecture.md)：目录、模块、运行流程与当前编码方式。
- [.agents/api-storage.md](.agents/api-storage.md)：消息、外部 API、权限与本地数据。
- [.agents/testing-delivery.md](.agents/testing-delivery.md)：命令依据、验证边界、安装打包。
- [.agents/engineering-debt.md](.agents/engineering-debt.md)：已知问题、约束差异及最小后续任务。

## 完成标准
- 变更范围与任务一致；修改功能时同步测试及对应工程专题，产品变更先按产品入口落盘。
- 运行与变更相关的验证并记录结果；源码变更至少核对 `npm run check` 和相关测试。
- 打包变更核对分发清单；文档初始化无需重新发布、联网调用模型或重装依赖。
- 报告已完成、未验证及阻断项；离线模拟测试不等于真实 API、浏览器或客户验收。
- 保持本入口精简；详细工程事实只存于 `.agents/`，详细产品事实只存于 `.product/`。

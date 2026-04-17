@AGENTS.md

## 二开分支保护规则

本项目是上游 AionUi 的二次开发分支，品牌已重命名为 **CoreAI**。上游同步通过 `scripts/sync-upstream.sh` 执行，合并保护通过 `.gitattributes` 的自定义 merge driver 实现。

### 核心原则

**凡是我们改动过的文件、或我们独有的文件，都必须加入 `.gitattributes` 合并保护。** 这是强制规则，不需要用户每次提醒。

### 合并策略选择

| 策略 | 适用场景 | 行为 |
|------|----------|------|
| `merge=ours` | 二进制文件（图标等）、我们独有的文件（上游不存在） | 完全保留本地版本，忽略上游 |
| `merge=keep-ours-on-conflict` | 上游也会修改的文本文件（代码、配置、i18n） | 三方合并，非冲突的上游改动正常合入，冲突处保留本地 |

### 操作流程

每次修改或新增文件后，必须执行以下检查：

1. **判断文件是否属于二开定制内容**（品牌名、图标、我们独有的功能、bug fix 等）
2. **如果是，立即将该文件加入 `.gitattributes`**，选择合适的 merge 策略
3. **如果文件路径有规律**（如 i18n 的多语言文件），优先使用 glob 模式（`*/common.json`）
4. **同步更新 `scripts/sync-upstream.sh`** 中的说明信息（如有必要）

### 当前保护的文件分类

- **图标文件**（`merge=ours`）：`resources/` 下的 ico/icns/png、`public/pwa/`、`mobile/assets/`、`src/renderer/assets/` 中的品牌图标
- **独有脚本**（`merge=ours`）：`scripts/sync-upstream.sh`、`scripts/generate-icons.*`
- **构建配置**（`merge=keep-ours-on-conflict`）：`package.json`、`electron-builder.yml`、`.gitattributes`、`.gitignore`
- **UI 组件**（`merge=keep-ours-on-conflict`）：Titlebar、Layout、AboutModalContent、index.html
- **后端服务标识**（`merge=keep-ours-on-conflict`）：MCP server 名称、DingTalk 卡片、Directory API 等
- **i18n 翻译**（`merge=keep-ours-on-conflict`，glob 模式）：`locales/*/common.json`、`conversation.json`、`cron.json`、`login.json`、`settings.json`
- **功能修改**（`merge=keep-ours-on-conflict`）：`configureChromium.ts`（userData 迁移）、`useDecisionDataSync.ts`（bug fix）

### 品牌标识约定

- 产品名：**CoreAI**
- 包名：`coreai`
- 开发模式名：`CoreAI-Dev` / `CoreAI-Dev-2`
- 协议：`coreai://`
- appId：`com.coreai.app`
- i18n 中所有用户可见的产品名使用 `CoreAI`，不使用 AionUi
- 图标替换使用 `bash scripts/generate-icons.sh <源图片路径>` 一键完成

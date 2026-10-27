# DeepSeek Harness · Overleaf

把 Overleaf 项目打开为 DeepSeek Harness 的本地工作区：拉取源文件、让 agent 编辑、在 Overleaf 服务器上编译，`output.pdf` 直接用内置预览查看，编译日志的报错会整理成「文件:行号: 消息」交给 agent 修复。

社区插件，与 Overleaf 或 DeepSeek 官方无隶属关系，使用的是 Overleaf 网页端的非官方接口。

## 工作方式

- **工作区就是一个本地目录**。打开项目时下载 zip 解压到 `~/.dsh/overleaf/projects/<项目名>-<id>/`，之后 agent 的 `read`/`write`/`edit`/`grep`/`bash` 等工具照常工作。插件不改写 `ctx.fs`，可以和 dsh-remote-ssh 同时安装。
- **实时双向同步（OT）**。打开项目后自动建立 Overleaf 实时连接（socket.io 0.9 长轮询）：
  - 本地文件保存（内置编辑器、外部编辑器、agent 工具都算）→ 生成 OT 操作推送到 Overleaf，秒级出现在网页端；
  - 协作者在 Overleaf 上的修改 → 推送回本地文件；
  - 远端新建/重命名/移动/删除文件 → 本地目录同步跟随；
  - 双方同时改同一段时走三方合并；合并失败时保留本地版本并在面板提示。
- **侧边栏区域**。左侧边栏底部有一块独立「Overleaf」区域（与 dsh-remote-ssh 的「远程工作区」同一机制）：列出已打开的项目与实时状态点（绿=同步中、黄=重连、红=出错、灰=未启动），点击直接进入项目；每个项目下方直接提供「编译」「新会话」和「结束/同步」三个操作，不必打开管理页。标题右侧的「管理」打开面板。Overleaf 项目只出现在这个区域，同一目录不会再作为普通工作区堆在「工作区」列表里（底层仍保留工作区与会话，agent、文件树和会话恢复照常工作）。
- **三栏工作区：目录｜文件｜对话**。进入 Overleaf 项目后，左侧项目/会话栏自动收起，工作区变成三栏：最左是单独的 Overleaf 目录树，中间是打开的文件（`.tex` 编辑器、PDF、图片等标签页），最右是聊天。点击左侧目录里的文件会直接在中间编辑栏打开，不会先出现在左侧目录栏；目录里的文件夹仍在原地展开/收起。目录栏与编辑区约为 1:3，对话栏保持 400px；拖动分隔条可以调整，离开项目时左侧项目栏会恢复。
- **会话不会因切换项目而丢失**。每个项目保留自己的对话列表；再次打开项目会回到上次正在进行的会话，而不是悄悄新建一个空白会话。管理页顶部是「已打开的项目与会话」，展开即可切换历史对话或新建会话。
- **打开项目即进入工作状态**。点击项目后自动切换到该项目最近使用的会话，并展开三栏编辑区：`文件` 树展示 Overleaf 结构，主 `.tex` 直接在内置编辑器标签页里打开，已有 `output.pdf` 时同时打开 PDF 预览；没有 PDF 时在编辑器里点「编译」生成，再点「PDF」查看。
- **内置 CodeMirror 编辑器**。在 Overleaf 工作区里，从 `文件` 树点击 `.tex`/`.bib`/`.sty`/`.cls` 等源文件，会打开可编辑的标签页（其他工作区仍是只读预览）：行号、LaTeX 语法高亮、括号匹配与自动补全、当前行高亮、2 空格缩进；`⌘/Ctrl+F` 搜索、`⌘/Ctrl+G` 查找下一个、`⌘/Ctrl+S` 保存并推送、顶部「编译」在服务器上编译；协作者或 AI 改动的文件会每两秒自动同步到编辑器。编辑器使用 DSH 设置里的代码字体和字号，切换浅色/深色主题即时生效。面板里的「编辑」提供带文件树的完整编辑器，效果相同。编辑器按需加载；极端情况下加载失败会自动退回等宽 `textarea`，`⌘/Ctrl+S` 仍然可用。
- **在文件树里直接新建文件和目录**。`文件` 标签页右上角的「＋文件」「＋目录」支持 `sections/intro.tex`、`figures/plots` 这样的相对路径，新文件会自动在中间栏打开。实时同步运行时，新目录也会同步到 Overleaf；同步停止时先建在本地，恢复同步后随目录监听推送。
- **可以随时结束工作**。编辑器顶部的「结束」或侧边栏项目下的「结束」会先推送待同步改动，然后关闭实时连接和目录监听，不再占用后台资源；文件全部保留在本机。之后点「同步」（或重新打开项目）即可恢复。管理页里每个项目也有「结束同步 / 启动同步」。
- **编译是手动的**。编辑器或侧边栏项目下的「编译」→ 先推送刚保存的改动，再在 Overleaf 服务器上编译 → `output.pdf`/`output.log` 写回工作区；已经打开的 PDF 预览会自动刷新，编辑器保持在前台显示编译结果。编译的是当前打开的 `.tex` 文件（而不是项目里随便挑一个主文件），所以 `证件照版.tex` 这类入口文件会按自己的 `\input` 关系和宏定义编译。日志错误整理成「文件:行号: 消息」，点击可跳到编辑器对应行。在线人数按账号去重统计，同一个人的多个连接不会重复计数。
- **兜底同步**：实时连接不可用时，仍可用 `overleaf_status` / `overleaf_pull` / `overleaf_push` 做快照式同步；开始/停止/暂停实时同步用 `overleaf_live` 工具或面板开关。

## 登录

1. 在浏览器中打开 Overleaf 并登录。
2. F12 打开开发者工具 → Network → 刷新 → 任选一个请求 → 复制请求头中整行 `Cookie` 的值。
3. 在 Harness 侧边栏「Overleaf」面板粘贴 Cookie，点「验证并登录」。Cookie 只保存在本机 `~/.dsh/overleaf/secrets.json`（0600）。

自托管的 Overleaf CE / Server Pro 同样支持：服务器地址填自己的实例地址，Cookie 一般是 `sharelatex.sid=…`。

Cookie 过期后所有请求会得到明确报错，重新粘贴即可。overleaf.com 有 Cloudflare/验证码保护，如果请求被拦截，插件无法绕过。

## Agent 工具

| 工具 | 作用 |
|---|---|
| `overleaf_projects` | 列出已登录服务器与已打开的工作区路径 |
| `overleaf_status` | 查看本地改动 |
| `overleaf_pull` | 拉取远端最新内容 |
| `overleaf_push` | 推送本地改动 |
| `overleaf_live` | 启动/停止/暂停实时同步并查看状态 |
| `overleaf_compile` | 编译并返回错误列表 |

典型用法：打开一个项目作为会话工作区，直接让 agent「把引言改短一点，编译直到没有错误」。agent 改 `.tex` 的瞬间改动就同步到 Overleaf，随后 `overleaf_compile` 编译，读错误，再改。

## 已知限制

- **实时连接走 xhr-polling**：没有用 WebSocket，延迟通常在亚秒到一两秒；断线会指数退避重连并重新 join 文档。
- **非 ASCII 内容**：OT 的插入/删除编码按参考实现处理（`joinDoc` 行是 latin1 打包的 UTF-8；删除长度按 ascii→utf8 解码），中文内容已通过本地 mock 测试，线上仍需实测确认。
- **评论/修订模式不参与同步**：Overleaf 的评论锚点与 track changes 元数据被忽略，同步的是纯文本编辑。
- **二进制文件是整文件替换**：图片等 fileRef 的本地改动会先删除远端实体再上传新文件。
- **编辑器能力**：内置编辑器是打包的 CodeMirror 5（懒加载约 480 KB），提供 LaTeX 语法高亮、括号匹配、搜索和缩进，但不带 LSP、自动补全与诊断；需要完整 IDE 体验时仍可用外部编辑器。
- **编译不自动触发**：按需点击或由 agent 调用（这是刻意选择，避免频繁占用编译配额）。
- **限流**：Overleaf 对 zip 下载约每分钟 10 次限流；实时连接本身不消耗这个配额。
- **快照工具与实时同步不要同时用**：实时同步运行时，`overleaf_pull/push` 会与 OT 冲突，请先停止实时同步。

## 安装

### 从 GitHub 安装（市场 / 一键安装，推荐）

```sh
dsh plugin --profile desktop add github:chenqaq123/dsh-overleaf-workshop
```

macOS 桌面版如果没有把 `dsh` 加进 PATH，直接用应用内自带的 CLI：

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add github:chenqaq123/dsh-overleaf-workshop
```

### 从 Release tarball 安装（市场 / 离线）

每个版本都会在 GitHub Release 附带打包好的 tarball，市场一键安装会优先使用它。可以直接安装这个 tarball：

```sh
dsh plugin --profile desktop add https://github.com/chenqaq123/dsh-overleaf-workshop/releases/download/v0.4.0/dsh-overleaf-workshop-0.4.0.tgz
```

### 从源码安装（打包方式）

先启动一次 Harness，使配置目录存在，然后**完全退出 Harness**：

```sh
git clone https://github.com/chenqaq123/dsh-overleaf-workshop.git
cd dsh-overleaf-workshop
npm install --omit=dev --ignore-scripts
node scripts/profile.mjs install desktop
```

安装器用 `npm pack` 在 `~/.dsh/plugin-packages/` 生成 tarball，再调用 DSH 原生的 `dsh plugin --profile desktop add file:<tarball>` 安装。插件文件会进入 DSH 自己的 profile，源码目录安装完成后可以移动或删除。重新打开 Harness 后，在「插件 → 已安装」中管理 `dsh-overleaf-workshop`。

> 包名已从 `dsh-overleaf` 改为 `dsh-overleaf-workshop`：npm 上的 `dsh-overleaf` 属于另一个 Overleaf 插件，继续使用会让市场按包名装错。旧版安装器升级时会只移除由本仓库安装的旧包，不会动第三方同名插件。

### 开发时链接安装

需要修改源码后直接重启生效时，使用：

```sh
node scripts/profile.mjs install desktop --link
```

该模式调用 `dsh plugin --profile desktop add link:<插件绝对路径>`，要求保留源码目录。macOS 下还需要允许 DeepSeek Harness 访问该目录，否则插件页会显示「包不可用」和 `EPERM`。

修改编辑器外观或 CodeMirror 版本后，重新生成懒加载的编辑器 chunk；提交前先检查它没有过期：

```sh
npm run build:editor
npm run check:editor
```

macOS 安装器优先使用桌面应用自带的 CLI；其他环境从 PATH 查找 `dsh`，可用 `DSH_CLI` / `DSH_HOME` 覆盖。

### 卸载

```sh
node scripts/profile.mjs uninstall desktop
```

## 依赖

- `fflate`（MIT）：解压项目 zip。
- `diff-match-patch`（Apache-2.0）：文本 diff、OT 操作生成与三方合并。
- `codemirror@5.65.16`（MIT，仅开发依赖）：编辑器源码；构建后的 `ui/client.editor.js` 已内置进发布包，运行时不需要 `node_modules`。许可证见 [`ui/codemirror-LICENSE`](ui/codemirror-LICENSE)。

## 许可证

[MIT](LICENSE)。本插件未使用 Overleaf Workshop（AGPL-3.0）的任何代码，协议实现基于对其行为的独立研究。

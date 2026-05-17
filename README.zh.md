<p align="center">
  <img src="docs/banner.svg" alt="Artifact Embed — 在 Obsidian 中嵌入 Claude 风格的 HTML 卡片" width="100%"/>
</p>

<p align="center">
  <a href="https://obsidian.md/"><img alt="Obsidian" src="https://img.shields.io/badge/Obsidian-1.4%2B-7C3AED?logo=obsidian&logoColor=white"></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-green.svg"></a>
  <img alt="Status" src="https://img.shields.io/badge/status-alpha-orange.svg">
</p>

<p align="center">
  <a href="README.md">English</a> · <b>中文</b>
</p>

**Artifact Embed** 让你把交互式 HTML —— 不论是本地文件、远程 URL 还是直接内联的源码 —— 像 Claude Desktop 的 artifact 卡片那样直接落到 Obsidian 笔记里。每个 artifact 都跑在 sandbox 化的 iframe 中，会继承你当前 Obsidian 主题的 CSS 变量，还自带一个小工具栏，可以重新加载、外部打开、复制源码。

## 效果演示

<p align="center">
  <video src="docs/demo.webm" controls width="720" muted playsinline></video>
</p>

> 如果你的 Markdown 渲染器不支持内联视频，可以[直接打开 / 下载 `docs/demo.webm`](docs/demo.webm)。

## 为什么需要这个？

原生 Obsidian 只渲染 Markdown。如果你想在笔记里嵌入一份带标签页的速查表、一个图表组件、或者一个独立的小工具，你的选择无非是：(a) 把原始 HTML 贴进笔记从而污染全局 CSS、(b) 单开一个 HTML viewer 标签页、(c) 用 iframe 把 URL 塞进侧栏。这几种方式都没法把一个精致、隔离、又能继承主题的 artifact 卡片**就地**放在正文旁边。这就是这个插件要做的事。

## 特性

- **统一语法** —— 单一的 `` ```artifact `` 代码块，内容是路径、URL 还是内联 HTML 都会自动识别。
- **默认 sandbox** —— 每个 artifact 跑在 `<iframe sandbox="allow-scripts">` 里，没有 same-origin 权限；iframe 内的 JS 拿不到 vault、cookie 或 `window.parent`。
- **主题感知** —— Obsidian 的 CSS 变量（`--background-primary`、`--text-normal`、`--font-text`…）会被注入 iframe，所以 HTML 里写 `var(--text-normal)` 就会自动跟随明暗模式。
- **带工具栏的卡片外壳** —— 🔄 重新加载 · 🌐 外部打开 · 📋 复制源码。
- **阅读模式与实时预览均可** —— 走 Obsidian 原生的 post-processor 管道，不依赖独立的 CodeMirror 插件。
- **逐块覆盖参数** —— 代码块第一行可以加 `height=600 title="My Demo"` 这样的指令。

## 用法

### 嵌入 Vault 里的文件

````markdown
```artifact
Assets/cheatsheet.html
```
````

### 嵌入外部 URL

````markdown
```artifact
https://example.com/
```
````

> 很多线上站点会设置 `X-Frame-Options: DENY` 或严格的 CSP，那些站点会拒绝在 iframe 里加载。这是远端站点的选择，不是插件的限制。

### 内联 HTML

````markdown
```artifact
height=320 title="Counter"
<!doctype html>
<html>
<body>
  <button id="b">+1</button>
  <span id="n">0</span>
  <script>
    let count = 0;
    document.getElementById('b').onclick = () => {
      document.getElementById('n').textContent = ++count;
    };
  </script>
</body>
</html>
```
````

### 识别规则

插件按下面的规则判断代码块主体的类型：

| 主体长得像 | 视作 |
|---|---|
| 单行、以 `http://` 或 `https://` 开头 | 外部 URL → `<iframe src=…>` |
| 单行、以 `.html`/`.htm` 结尾且没有 `<` | Vault 路径 → 读取文件 → `<iframe srcdoc=…>` |
| 其他 | 内联 HTML → `<iframe srcdoc=…>` |

### 指令（可选的第一行）

如果代码块**第一行**符合 `key=value` 语法（且不含 `<`），就会被解析为指令：

| 键 | 作用 | 默认值 |
|---|---|---|
| `height` | iframe 高度，单位 px | `480` |
| `title` | 卡片头部显示的文字 | 文件路径 / URL / `inline HTML` |

```artifact
height=600 title="Big chart"
<svg>…</svg>
```

## 用 Claude 生成兼容的 HTML

Claude（以及其他走 Anthropic artifact 风格的生成器）默认用自家那套 CSS token —— `--color-background-primary`、`--color-text-primary`、`--font-sans`、`--border-radius-lg` 等等。Obsidian 里并没有这些变量，所以 artifact 会渲染成无背景、无边框、字体也回退到浏览器默认值。

为了让 Claude 稳定输出主题感知的 HTML，完整的规则集被打包成了一个可复用的 **Skill**，放在 [`skills/artifact-embed/SKILL.md`](skills/artifact-embed/SKILL.md)。Skill 覆盖了 Obsidian 原生变量映射、sandbox 约束、输出格式，以及把已有 Anthropic 风格 artifact 迁移过来的查找替换表。

### 怎么使用这个 Skill

- **Claude Code / Claude Agent SDK** —— 把 `skills/artifact-embed/` 目录放进你的项目，或者软链到 `~/.claude/skills/artifact-embed/`。之后只要你提出 Obsidian artifact 相关的需求，Claude 会自动调用它。
- **claude.ai 网页版 / Claude Desktop** —— 打开 `SKILL.md`，复制正文，粘贴成新建项目或对话的 system prompt（或第一条消息）。
- **其他 LLM** —— 文件是纯 Markdown，直接作为 system prompt 喂给 ChatGPT、Gemini 或任何你用来生成 HTML 的工具。

Skill 引导 Claude 输出的最小骨架长这样：

```html
<style>
  .card {
    background: var(--background-primary);
    color: var(--text-normal);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    padding: 1rem;
    font-family: var(--font-text);
  }
  .card code {
    font-family: var(--font-monospace);
    background: var(--background-secondary);
    padding: 1px 6px;
    border-radius: var(--radius-s);
  }
</style>
<div class="card">…</div>
```

### 工作流

1. 把 Skill 装进你的 Claude 环境（上面三种方式任选其一）。
2. 让 Claude 帮你生成想要的小工具 —— 速查表、计算器、图表、小工具皆可。
3. 把返回的 HTML 复制进笔记，包在 `` ```artifact `` 块里；或者另存为 `Assets/xxx.html`，然后用 `` ```artifact\nAssets/xxx.html\n`` `` 引用。
4. 重新加载笔记，artifact 就会跟着你当前的 Obsidian 主题（亮/暗、自定义 snippet、字体覆盖）走。

> 已经有用 `--color-*` token 写好的 Claude artifact？两条路：要么把它再丢给 Skill 重新生成；要么照着 [Skill 里的迁移映射表](skills/artifact-embed/SKILL.md#migrating-an-existing-anthropic-style-artifact)手动做一次查找替换。

## 安装

这个插件还没上 Obsidian 社区插件商店。从源码安装：

1. 从最新 [release](https://github.com/LeonYew-Ley/obsidian-artifact-embed/releases) 下载 `manifest.json`、`main.js`、`styles.css`（或者直接 clone 这个仓库）
2. 放进 `<你的 vault>/.obsidian/plugins/obsidian-artifact-embed/`
3. 重新加载 Obsidian（`Ctrl+P` → *Reload app without saving*）
4. 进入 *Settings → Community plugins*，启用 **Artifact Embed**

## 安全模型

iframe 用 `allow-scripts allow-forms allow-popups allow-modals` 的 sandbox 配置。**`allow-same-origin` 被刻意省略**。后果：

- ✅ iframe 内脚本可以正常运行
- ✅ 表单、弹窗、模态框对于自包含的小工具能正常工作
- ❌ iframe 内的 JS 拿不到、也写不了 `window.parent`、`document.cookie`、`localStorage` 或 vault 状态
- ❌ iframe 内的 JS 没法向你的文件系统发起 same-origin 请求

如果你确实需要这些权限，那你大概率要的是另一种插件（Templater、Dataview JS、CustomJS）。本插件的设计基线就是：*安全地渲染不可信的 HTML*。

## 限制与已知缺口

- **没有内容感知的自动高度。** 高度固定（默认 480px）；每个块可以用 `height=…` 单独覆盖。要实现自动高度需要每个被嵌入的文档主动发 `postMessage`，我们刻意不强制这一点。
- **设置了严格 frame 策略的远端站点加载不了。** 这是服务端的拦截 —— 任何插件都没法绕开。
- **v0.1 还没有 settings 面板。** 默认高度和 sandbox 标志暂时是硬编码。

## 示例

参考 [`examples/test-note.md`](examples/test-note.md) —— 放进任意 vault 即可验证三种语法都能正常渲染。

## Banner 致谢

Banner 是手写的 SVG（`docs/banner.svg`），不依赖任何外部工具。想自己做插件 banner 的话，常见的免费方案包括：

- **[Figma](https://www.figma.com/)** —— 最主流，有免费层，导出 PNG/SVG 方便
- **[Penpot](https://penpot.app/)** —— 完全开源的 Figma 替代品
- **[Canva](https://www.canva.com/)** —— 模板驱动，非设计师起步最快
- **[Excalidraw](https://excalidraw.com/)** —— 手绘风，Obsidian 里也有同名插件
- **[Satori](https://github.com/vercel/satori)** —— 用 JSX 程序化生成 banner（FOSS，Vercel 出品）

## 许可

[MIT](LICENSE) © LeonYew-Ley

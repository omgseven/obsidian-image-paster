# Obsidian Image Paster

[English](README.md) | 简体中文

粘贴剪切板图片时，保存到每篇笔记专属的图片目录，并在光标处插入可移植的 Markdown 图片引用。

## 功能

在任意笔记中粘贴剪切板图片时，插件会：

1. 保存到笔记同级、以 `<笔记名>.assets` 命名的专属目录（`test-01.md` -> `test-01.assets/`）；子目录笔记同理（`notes/test-01.md` -> `notes/test-01.assets/`）。
2. 在光标处插入标准 Markdown 引用，例如 `![image-20261015-141039](./test-01.assets/image-20261015-141039.png)`。
3. 支持一次粘贴多张图片，逐行插入引用。
4. 不会覆盖已有文件：文件名基于时间戳，重名时自动追加序号。
5. 通过 vault 接口写入，图片即时被索引，在 Obsidian 与通用 Markdown 工具中均可渲染；纯文本粘贴仍走 Obsidian 默认逻辑。

## 为什么不用隐藏的点目录

Obsidian 在索引阶段忽略点前缀目录（`.foo/`），其中的图片无法被解析，预览会报“找不到文件”。`<笔记名>.assets` 目录不带前导点，会被正常索引，图片在 Obsidian 与通用 Markdown 工具中都能显示。

## 隐藏图片目录

插件注入一条静态 CSS，把所有 `*.assets` 目录从 Obsidian 文件列表中隐藏，侧边栏保持整洁，图片仍正常渲染。可在「在文件列表中隐藏图片目录」设置项关闭。

该隐藏依赖 Obsidian 文件列表的 DOM 结构（`.nav-folder-title[data-path]`），并非稳定公开接口，未来版本升级可能需要适配。隐藏仅作用于展示层；若还想让目录不进搜索、关系图与反链，可在「设置 -> 文件与链接 -> 排除的文件」中加入 `*.assets`。

## 安装

### 通过发布包安装

把 `main.js`、`manifest.json`（如有 `styles.css` 一并）复制到你的 vault：

```
<vault>/.obsidian/plugins/obsidian-image-paster/
```

然后在「设置 -> 第三方插件」中启用 **Image Paster**。

### 从源码构建

```bash
git clone <this-repo> obsidian-image-paster
cd obsidian-image-paster
npm install
./build.sh install /path/to/your/vault
```

`./build.sh` 会编译插件并把运行态文件汇总到 `dist/`；加上 `install <vault路径>` 参数还会复制到该 vault 的插件目录。之后在 Obsidian 中启用或重载插件即可。

## 使用

打开任意笔记，用 `Ctrl/Cmd + V` 粘贴图片，插件会保存图片并在光标处插入引用。

## 设置

| 设置项 | 说明 |
| --- | --- |
| 图片目录后缀 | 目录名 = 笔记名 + 后缀，例如 `test-01.assets`，默认 `.assets`。目录名不能以点开头。 |
| 在文件列表中隐藏图片目录 | 注入一条静态 CSS 隐藏 `*.assets` 目录，图片仍渲染，默认开启。 |
| 图片文件名模板 | 变量：`${date}`=YYYYMMDD、`${time}`=HHmmss、`${datetime}`、`${ms}`，默认 `image-${date}-${time}`。 |
| 使用相对路径前缀 ./ | 引用带 `./` 前缀，兼容性更好，默认开启。 |
| 图片 alt 文本 | 使用文件名或留空。 |

## 开发

```bash
npm run dev     # 监听模式，改动即重建 main.js
npm run build   # 类型检查 + 生产构建
./build.sh      # 构建并汇总 dist/
```

项目结构：

```
src/main.ts          源码
manifest.json        插件元信息
package.json         依赖与脚本
esbuild.config.mjs   构建配置
build.sh             构建与安装脚本
main.js              打包产物（自动生成）
dist/                发布产物（自动生成）
```

## 许可

MIT

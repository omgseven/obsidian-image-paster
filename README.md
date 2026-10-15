# Obsidian Image Paster

English | [简体中文](README_ZH.md)

Paste clipboard images into a per-note attachment folder and insert a portable Markdown reference.

## Features

When you paste an image from the clipboard into a note, the plugin:

1. Saves it into a per-note folder named `<note>.assets` beside the note (`test-01.md` -> `test-01.assets/`). Sub-folder notes work the same way (`notes/test-01.md` -> `notes/test-01.assets/`).
2. Inserts a standard Markdown reference at the cursor, for example `![image-20261015-141039](./test-01.assets/image-20261015-141039.png)`.
3. Handles multiple images in a single paste, inserting one reference per line.
4. Never overwrites existing files: names are timestamp based and auto-incremented on collision.
5. Writes through the vault API, so the image is indexed immediately and renders in both Obsidian and generic Markdown tools. Plain-text pastes are left to Obsidian's default behavior.

## Why not a hidden dot-folder

Obsidian ignores dot-prefixed folders (`.foo/`) during indexing, so images stored there are not resolved and show as "file not found" in the preview. The `<note>.assets` folder has no leading dot, so it is indexed and images render normally, in Obsidian and in generic Markdown tools alike.

## Hiding attachment folders

The plugin injects one static CSS rule that hides every `*.assets` folder from Obsidian's file explorer, so the sidebar stays clean while images still render. Turn it off via the "Hide attachment folders in file explorer" setting.

This relies on Obsidian's file-explorer DOM structure (`.nav-folder-title[data-path]`), which is not a stable public API, so a future Obsidian update may require a fix. Hiding is visual only; to also keep the folders out of search, graph, and backlinks, add `*.assets` to Settings -> Files & Links -> Excluded files.

## Installation

### From a release

Copy `main.js` and `manifest.json` (plus `styles.css` if present) into your vault:

```
<vault>/.obsidian/plugins/obsidian-image-paster/
```

Then enable **Image Paster** under Settings -> Community plugins.

### Build from source

```bash
git clone <this-repo> obsidian-image-paster
cd obsidian-image-paster
npm install
./build.sh install /path/to/your/vault
```

`./build.sh` compiles the plugin and assembles the runtime files into `dist/`. Adding `install <vault>` also copies them into the vault's plugin folder. Reload or enable the plugin in Obsidian afterwards.

## Usage

Open any note and paste an image with `Ctrl/Cmd + V`. The image is saved and the reference is inserted at the cursor.

## Settings

| Setting | Description |
| --- | --- |
| Attachment folder suffix | Folder name = note name + suffix, e.g. `test-01.assets`. Default `.assets`. Must not produce a dot-prefixed folder. |
| Hide attachment folders in file explorer | Injects one static CSS rule to hide `*.assets` folders from the explorer; images still render. On by default. |
| Image filename template | Variables: `${date}`=YYYYMMDD, `${time}`=HHmmss, `${datetime}`, `${ms}`. Default `image-${date}-${time}`. |
| Use relative path prefix ./ | Prefix the reference with `./` for better compatibility. On by default. |
| Image alt text | Use the file name or leave it empty. |

## Development

```bash
npm run dev     # watch mode, rebuilds main.js on change
npm run build   # type check + production bundle
./build.sh      # build and assemble dist/
```

Project layout:

```
src/main.ts          Source code
manifest.json        Plugin metadata
package.json         Dependencies and scripts
esbuild.config.mjs   Build config
build.sh             Build and install helper
main.js              Bundled output (generated)
dist/                Release artifacts (generated)
```

## License

MIT

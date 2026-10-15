#!/usr/bin/env bash
# Image Paster 构建脚本
#
# 用法:
#   ./build.sh                      构建并组装发布产物到 dist/
#   ./build.sh install <vault路径>  构建后安装到指定 vault 的插件目录
#
# 示例:
#   ./build.sh install /Users/chaoyi/ws/omg-world
set -euo pipefail

# 切换到脚本所在目录，保证相对路径稳定
cd "$(dirname "$0")"

PLUGIN_ID="$(node -p "require('./manifest.json').id")"
DIST_DIR="dist"

echo "==> 编译插件 (npm run build)"
npm run build

echo "==> 组装发布产物到 ${DIST_DIR}/"
rm -rf "${DIST_DIR}"
mkdir -p "${DIST_DIR}"

cp main.js "${DIST_DIR}/"
cp manifest.json "${DIST_DIR}/"
if [ -f styles.css ]; then
	cp styles.css "${DIST_DIR}/"
fi
if [ -f versions.json ]; then
	cp versions.json "${DIST_DIR}/"
fi

echo "==> dist/ 产物清单:"
ls -1 "${DIST_DIR}"

# 可选: 安装到指定 vault 的插件目录
if [ "${1:-}" = "install" ]; then
	VAULT="${2:-}"
	if [ -z "${VAULT}" ]; then
		echo "错误: install 需要提供 vault 路径，例如 ./build.sh install /path/to/vault" >&2
		exit 1
	fi
	TARGET="${VAULT}/.obsidian/plugins/${PLUGIN_ID}"
	echo "==> 安装到 ${TARGET}"
	mkdir -p "${TARGET}"
	cp "${DIST_DIR}/main.js" "${TARGET}/"
	cp "${DIST_DIR}/manifest.json" "${TARGET}/"
	if [ -f "${DIST_DIR}/styles.css" ]; then
		cp "${DIST_DIR}/styles.css" "${TARGET}/"
	fi
	echo "==> 完成。请在 Obsidian 设置 -> 第三方插件中启用或重载 ${PLUGIN_ID}"
fi

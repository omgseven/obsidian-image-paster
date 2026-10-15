import {
	App,
	Editor,
	MarkdownFileInfo,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	normalizePath,
} from "obsidian";

/**
 * 插件设置项。
 */
interface ImagePasterSettings {
	/** 图片文件名模板，支持 ${date} ${time} ${datetime} ${ms} 变量。 */
	fileNameTemplate: string;
	/** 图片目录后缀，目录名 = 笔记名 + 后缀，如 test-01.assets。 */
	folderSuffix: string;
	/** 是否在文件列表中隐藏图片目录（注入一条静态 CSS 实现）。 */
	hideFolderInExplorer: boolean;
	/** 生成的引用是否使用 ./ 相对前缀。 */
	useRelativePrefix: boolean;
	/** 引用中的 alt 文本使用什么内容。 */
	altTextMode: "filename" | "empty";
}

const DEFAULT_SETTINGS: ImagePasterSettings = {
	fileNameTemplate: "image-${date}-${time}",
	folderSuffix: ".assets",
	hideFolderInExplorer: true,
	useRelativePrefix: true,
	altTextMode: "filename",
};

/** MIME 类型到扩展名的映射。 */
const MIME_EXT: Record<string, string> = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/jpg": "jpg",
	"image/gif": "gif",
	"image/webp": "webp",
	"image/bmp": "bmp",
	"image/svg+xml": "svg",
	"image/avif": "avif",
	"image/heic": "heic",
	"image/heif": "heif",
	"image/tiff": "tif",
};

/** 通过文件名匹配图片扩展名的正则。 */
const IMAGE_NAME_RE = /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif|tif?f?)$/i;

export default class ImagePasterPlugin extends Plugin {
	settings: ImagePasterSettings = DEFAULT_SETTINGS;
	private styleEl: HTMLStyleElement | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new ImagePasterSettingTab(this.app, this));
		this.applyHideCss();

		// 监听编辑器粘贴事件。
		this.registerEvent(
			this.app.workspace.on("editor-paste", this.onEditorPaste.bind(this))
		);
	}

	onunload(): void {
		this.removeHideCss();
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/**
	 * 清理并返回合法的目录后缀（去掉路径非法字符，保留点号）。
	 */
	private cleanFolderSuffix(): string {
		return (this.settings.folderSuffix ?? "").replace(/[\\/:*?"<>|]+/g, "");
	}

	/**
	 * 目录命名使用的后缀，空值回退到默认。
	 */
	private effectiveFolderSuffix(): string {
		const suffix = this.cleanFolderSuffix();
		return suffix.length > 0 ? suffix : DEFAULT_SETTINGS.folderSuffix;
	}

	/**
	 * 注入一条静态 CSS，把文件列表里以后缀结尾的目录整体隐藏。
	 * 仅作用于文件列表的展示层，不影响笔记中图片的渲染。
	 */
	applyHideCss(): void {
		const suffix = this.cleanFolderSuffix();
		if (!this.settings.hideFolderInExplorer || suffix.length === 0) {
			this.removeHideCss();
			return;
		}
		const selector = `.nav-folder-title[data-path$="${suffix}"]`;
		const css =
			`${selector}, ${selector} + .nav-folder-children { ` +
			`display: none !important; }`;
		if (!this.styleEl) {
			this.styleEl = document.createElement("style");
			this.styleEl.id = "obsidian-image-paster-hide";
			document.head.appendChild(this.styleEl);
		}
		this.styleEl.textContent = css;
	}

	private removeHideCss(): void {
		if (this.styleEl) {
			this.styleEl.remove();
			this.styleEl = null;
		}
	}

	/**
	 * 粘贴事件处理：剪切板含图片时接管，保存图片并插入引用。
	 * 返回 true 表示已处理，阻止 Obsidian 默认粘贴行为。
	 */
	private async onEditorPaste(
		evt: ClipboardEvent,
		editor: Editor,
		info: MarkdownFileInfo
	): Promise<boolean> {
		const images = this.extractImages(evt);
		if (images.length === 0) {
			// 剪切板没有图片，交给默认逻辑处理。
			return false;
		}

		const noteFile: TFile | null =
			info.file ?? this.app.workspace.getActiveFile();
		if (!noteFile) {
			new Notice(
				"Image Paster: The current note is not saved yet. Please save it before pasting images. 当前笔记尚未保存，请先保存后再粘贴图片。"
			);
			evt.preventDefault();
			return true;
		}

		evt.preventDefault();
		try {
			const snippets: string[] = [];
			for (const image of images) {
				snippets.push(await this.saveImage(image, noteFile));
			}
			editor.replaceSelection(snippets.join("\n"));
		} catch (err) {
			console.error("[Image Paster] Failed to save image 保存图片失败", err);
			new Notice(
				"Image Paster: Failed to save image. 保存图片失败 - " +
					(err instanceof Error ? err.message : String(err))
			);
		}
		return true;
	}

	/**
	 * 从剪切板事件中筛选出图片文件。
	 */
	private extractImages(evt: ClipboardEvent): File[] {
		const files = evt.clipboardData?.files;
		if (!files || files.length === 0) {
			return [];
		}
		const images: File[] = [];
		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			if (file.type.startsWith("image/") || IMAGE_NAME_RE.test(file.name)) {
				images.push(file);
			}
		}
		return images;
	}

	/**
	 * 保存单张图片到笔记同级的 <笔记名><后缀> 目录，返回 Markdown 引用文本。
	 *
	 * 目录不带前导点，Obsidian 会正常索引，图片可在预览中渲染；
	 * 使用 vault 接口写入以获得即时索引，避免刚插入引用时短暂解析不到。
	 */
	private async saveImage(image: File, noteFile: TFile): Promise<string> {
		const vault = this.app.vault;

		const noteDir = noteFile.parent?.path ?? "";
		const dirName = noteFile.basename + this.effectiveFolderSuffix();
		const dirPath = normalizePath(
			noteDir ? `${noteDir}/${dirName}` : dirName
		);

		if (!vault.getAbstractFileByPath(dirPath)) {
			await vault.createFolder(dirPath);
		}

		const ext = this.resolveExtension(image);
		const fileName = await this.uniqueFileName(dirPath, ext);
		const filePath = normalizePath(`${dirPath}/${fileName}`);

		const buffer = await image.arrayBuffer();
		await vault.createBinary(filePath, buffer);

		return this.buildReference(dirName, fileName);
	}

	/**
	 * 构造兼容通用 Markdown 与 Obsidian 的相对路径图片引用。
	 */
	private buildReference(dirName: string, fileName: string): string {
		const prefix = this.settings.useRelativePrefix ? "./" : "";
		const relPath = `${prefix}${dirName}/${fileName}`;
		// 逐段编码，保留路径分隔符，兼容含空格等特殊字符的文件名。
		const encoded = relPath
			.split("/")
			.map((seg) => encodeURIComponent(seg))
			.join("/");
		const alt =
			this.settings.altTextMode === "filename"
				? fileName.replace(/\.[^.]+$/, "")
				: "";
		return `![${alt}](${encoded})`;
	}

	/**
	 * 根据 MIME 或文件名推断扩展名，兜底为 png。
	 */
	private resolveExtension(image: File): string {
		const fromMime = MIME_EXT[image.type.toLowerCase()];
		if (fromMime) {
			return fromMime;
		}
		const match = image.name.match(IMAGE_NAME_RE);
		if (match) {
			const ext = match[1].toLowerCase();
			return ext === "jpeg" ? "jpg" : ext;
		}
		return "png";
	}

	/**
	 * 在目标目录中生成不冲突的文件名。
	 */
	private async uniqueFileName(dirPath: string, ext: string): Promise<string> {
		const listing = await this.app.vault.adapter.list(dirPath);
		const existing = new Set(
			listing.files.map((p) => p.split("/").pop() ?? p)
		);
		const base = this.renderTemplate(this.settings.fileNameTemplate);
		let candidate = `${base}.${ext}`;
		let index = 1;
		while (existing.has(candidate)) {
			candidate = `${base}-${index}.${ext}`;
			index++;
		}
		return candidate;
	}

	/**
	 * 渲染文件名模板中的时间变量，并清理非法字符。
	 */
	private renderTemplate(template: string): string {
		const now = new Date();
		const pad = (n: number, len = 2) => String(n).padStart(len, "0");
		const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
			now.getDate()
		)}`;
		const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(
			now.getSeconds()
		)}`;
		const ms = pad(now.getMilliseconds(), 3);

		const rendered = (template || DEFAULT_SETTINGS.fileNameTemplate)
			.replace(/\$\{datetime\}/g, `${date}-${time}`)
			.replace(/\$\{date\}/g, date)
			.replace(/\$\{time\}/g, time)
			.replace(/\$\{ms\}/g, ms);

		const sanitized = rendered.replace(/[\\/:*?"<>|]+/g, "-").trim();
		return sanitized || "image";
	}
}

/**
 * 插件设置面板。
 */
class ImagePasterSettingTab extends PluginSettingTab {
	plugin: ImagePasterPlugin;

	constructor(app: App, plugin: ImagePasterPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Image Paster Settings 设置" });

		new Setting(containerEl)
			.setName("Attachment folder suffix 图片目录后缀")
			.setDesc(
				"Folder name = note name + suffix, e.g. test-01.assets. Do not leave it empty; the folder must not start with a dot, otherwise Obsidian ignores it and images will not render. 目录名 = 笔记名 + 此后缀，例如 test-01.assets；请勿留空，目录名不能以点开头，否则 Obsidian 会忽略导致图片无法显示。"
			)
			.addText((text) =>
				text
					.setPlaceholder(".assets")
					.setValue(this.plugin.settings.folderSuffix)
					.onChange(async (value) => {
						this.plugin.settings.folderSuffix = value;
						await this.plugin.saveSettings();
						this.plugin.applyHideCss();
					})
			);

		new Setting(containerEl)
			.setName("Hide attachment folders in file explorer 在文件列表中隐藏图片目录")
			.setDesc(
				"Injects one static CSS rule to hide folders ending with the suffix from Obsidian's file explorer. Images still render. Relies on Obsidian's explorer DOM, so a future update may require a fix. 注入一条静态 CSS，把以该后缀结尾的目录从文件列表隐藏；图片仍正常渲染。依赖 Obsidian 文件列表的 DOM 结构，未来版本升级可能需要适配。"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.hideFolderInExplorer)
					.onChange(async (value) => {
						this.plugin.settings.hideFolderInExplorer = value;
						await this.plugin.saveSettings();
						this.plugin.applyHideCss();
					})
			);

		new Setting(containerEl)
			.setName("Image filename template 图片文件名模板")
			.setDesc(
				"Variables 支持变量: ${date}=YYYYMMDD, ${time}=HHmmss, ${datetime}=date-time 日期-时间, ${ms}=milliseconds 毫秒. Default 默认: image-${date}-${time}."
			)
			.addText((text) =>
				text
					.setPlaceholder("image-${date}-${time}")
					.setValue(this.plugin.settings.fileNameTemplate)
					.onChange(async (value) => {
						this.plugin.settings.fileNameTemplate =
							value.trim() || DEFAULT_SETTINGS.fileNameTemplate;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Use relative path prefix ./ 使用相对路径前缀 ./")
			.setDesc(
				"Prefix the reference with ./ so it is explicitly relative to the note folder, improving compatibility with generic Markdown and Obsidian. 生成的图片引用带 ./ 前缀，明确相对当前笔记目录，通用 Markdown 与 Obsidian 兼容性更好。"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.useRelativePrefix)
					.onChange(async (value) => {
						this.plugin.settings.useRelativePrefix = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Image alt text 图片 alt 文本")
			.setDesc("The alt content in the ![alt] reference. 引用中 ![alt] 的 alt 内容。")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("filename", "Use filename 使用文件名")
					.addOption("empty", "Empty 留空")
					.setValue(this.plugin.settings.altTextMode)
					.onChange(async (value) => {
						this.plugin.settings.altTextMode =
							value === "empty" ? "empty" : "filename";
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("p", {
			text:
				"Tip: Hiding is visual only. To also keep attachment folders out of search, graph, and backlinks, add *.assets to Settings -> Files & Links -> Excluded files. " +
				"提示：隐藏仅作用于文件列表展示。若还想让图片目录不进搜索、关系图与反链，可在「设置 -> 文件与链接 -> 排除的文件」中加入 *.assets。",
		});
	}
}

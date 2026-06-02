import { MarkdownView, Notice, Plugin, WorkspaceLeaf, type Editor } from "obsidian";
import { VIEW_TYPE_SCIENTIFIC_CALCULATOR } from "./constants";
import { DEFAULT_ACCENT_COLOR, DEFAULT_SETTINGS, LEGACY_CUPERTINO_ACCENT_COLOR, CalculatorPluginSettings, CalculatorSettingTab } from "./settings";
import { ScientificCalculatorView } from "./view/CalculatorView";
import { CalculatorEngine, EvaluationResult } from "./engine/CalculatorEngine";
import { formatLatexEquation, formatObsidianLatexBlock } from "./engine/latex";

const RAINBOW_ACCENT_COLORS = ["#2f7cf6", "#5e5ce6", "#bf5af2", "#ff4f9a", "#ff6b4a", "#ff9f0a", "#32d74b", "#30b0c7"] as const;
const RAINBOW_ACCENT_STEP_MS = 12_000;
const RAINBOW_ACCENT_TICK_MS = 280;

export default class ScientificCalculatorPlugin extends Plugin {
  settings: CalculatorPluginSettings = { ...DEFAULT_SETTINGS };
  private readonly commandEngine = new CalculatorEngine();
  private readonly onAccentColorCache = new Map<string, "#ffffff" | "#08111f">();
  private lastMarkdownEditor: Editor | null = null;
  private rainbowAccentFrame: number | null = null;
  private rainbowAccentLastTick = 0;
  private rainbowAccentLastColor = "";

  async onload(): Promise<void> {
    await this.loadSettings();
    this.configureRainbowAccent();

    this.registerView(
      VIEW_TYPE_SCIENTIFIC_CALCULATOR,
      (leaf) => new ScientificCalculatorView(leaf, this)
    );

    this.addRibbonIcon("calculator", "Open Calculator Pro", async () => {
      await this.activateView();
    });

    this.addCommand({
      id: "open",
      name: "Open",
      callback: async () => this.activateView()
    });

    this.addCommand({
      id: "reset",
      name: "Reset",
      callback: () => {
        this.app.workspace.getLeavesOfType(VIEW_TYPE_SCIENTIFIC_CALCULATOR).forEach((leaf) => {
          const view = leaf.view;
          if (view instanceof ScientificCalculatorView) view.resetCalculator();
        });
        new Notice("Calculator Pro reset.");
      }
    });

    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.rememberActiveMarkdownEditor()));
    this.rememberActiveMarkdownEditor();

    this.addSettingTab(new CalculatorSettingTab(this.app, this));
  }

  onunload(): void {
    this.stopRainbowAccent(false);
  }

  async loadSettings(): Promise<void> {
    const loaded = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded, {
      history: Array.isArray(loaded?.history) ? loaded.history : []
    });
    const loadedAccentColor = typeof loaded?.accentColor === "string" ? loaded.accentColor.trim().toLowerCase() : "";
    this.settings.accentColor = this.normalizeAccentColor(
      !loadedAccentColor || loadedAccentColor === LEGACY_CUPERTINO_ACCENT_COLOR
        ? DEFAULT_ACCENT_COLOR
        : loadedAccentColor
    );
    this.settings.rainbowAccentEnabled = Boolean(this.settings.rainbowAccentEnabled);
    this.settings.adaptiveThemeEnabled = Boolean(this.settings.adaptiveThemeEnabled);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  getActiveAccentColor(): string {
    if (!this.settings.rainbowAccentEnabled) return this.settings.accentColor;
    return this.getRainbowAccentColor();
  }

  async setAccentColor(color: string): Promise<void> {
    this.settings.accentColor = this.normalizeAccentColor(color);
    await this.saveSettings();
    this.applyAccentToUi();
    this.refreshViews();
  }

  async setRainbowAccentEnabled(enabled: boolean): Promise<void> {
    this.settings.rainbowAccentEnabled = Boolean(enabled);
    await this.saveSettings();
    this.configureRainbowAccent();
    this.refreshViews();
  }

  async setAdaptiveThemeEnabled(enabled: boolean): Promise<void> {
    this.settings.adaptiveThemeEnabled = Boolean(enabled);
    await this.saveSettings();
    this.applyAccentToUi();
    this.refreshViews();
  }

  applyAccentToElement(element: HTMLElement | null | undefined, accentColor?: string): void {
    if (!element) return;
    const color = this.normalizeAccentColor(accentColor || this.getActiveAccentColor());
    const accentKey = `bg-v2|${this.settings.adaptiveThemeEnabled ? "adaptive" : "fixed"}|${color}`;
    if (element.getAttribute("data-calculator-pro-accent-cache") === accentKey) return;

    element.toggleClass("msc-fixed-appearance", !this.settings.adaptiveThemeEnabled);
    element.toggleClass("msc-adaptive-appearance", this.settings.adaptiveThemeEnabled);
    element.addClass("msc-custom-accent");
    element.removeClass("msc-theme-accent");

    const usesFixedAppearance = !this.settings.adaptiveThemeEnabled;
    const deepBase = usesFixedAppearance ? "#06111f" : "var(--background-primary)";
    const midBase = usesFixedAppearance ? "#111722" : "var(--background-primary)";
    const bottomBase = usesFixedAppearance ? "#0e1219" : "var(--background-primary)";
    const onAccent = this.getOnAccentColor(color);
    element.style.setProperty("--interactive-accent", color);
    element.style.setProperty("--msc-accent", color);
    element.style.setProperty("--msc-user-accent", color);
    element.style.setProperty("--msc-on-accent", onAccent);
    element.style.setProperty("--msc-accent-strong", `color-mix(in srgb, ${color} 88%, #ffffff 12%)`);
    element.style.setProperty("--msc-accent-soft", `color-mix(in srgb, ${color} 13%, transparent)`);
    element.style.setProperty("--msc-aura", color);
    element.style.setProperty("--msc-background-accent", color);
    element.style.setProperty("--msc-background-glow", `color-mix(in srgb, ${color} 40%, transparent)`);
    element.style.setProperty("--msc-background-soft", `color-mix(in srgb, ${color} 16%, transparent)`);
    element.style.setProperty("--msc-background-deep", `color-mix(in srgb, ${color} 24%, ${deepBase} 76%)`);
    element.style.setProperty("--msc-background-mid", `color-mix(in srgb, ${color} 12%, ${midBase} 88%)`);
    element.style.setProperty("--msc-background-bottom", `color-mix(in srgb, ${color} 5%, ${bottomBase} 95%)`);
    element.style.setProperty("--text-on-accent", onAccent);
    element.setAttribute("data-calculator-pro-accent-cache", accentKey);
  }

  applyAccentToUi(): void {
    const color = this.getActiveAccentColor();
    for (const element of Array.from(document.querySelectorAll<HTMLElement>(".msc-view, .calculator-pro-settings"))) {
      this.applyAccentToElement(element, color);
    }
  }

  private getRainbowAccentColor(now = Date.now()): string {
    const paletteSize = RAINBOW_ACCENT_COLORS.length;
    const cycleMs = paletteSize * RAINBOW_ACCENT_STEP_MS;
    const position = ((now % cycleMs) + cycleMs) % cycleMs;
    const fromIndex = Math.floor(position / RAINBOW_ACCENT_STEP_MS);
    const toIndex = (fromIndex + 1) % paletteSize;
    const rawProgress = (position - fromIndex * RAINBOW_ACCENT_STEP_MS) / RAINBOW_ACCENT_STEP_MS;
    const easedProgress = 0.5 - Math.cos(rawProgress * Math.PI) / 2;
    return this.mixHexColors(RAINBOW_ACCENT_COLORS[fromIndex]!, RAINBOW_ACCENT_COLORS[toIndex]!, easedProgress);
  }

  private mixHexColors(from: string, to: string, progress: number): string {
    const [fromR, fromG, fromB] = this.hexToRgb(from);
    const [toR, toG, toB] = this.hexToRgb(to);
    const t = Math.max(0, Math.min(1, progress));
    const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
    return this.rgbToHex(mix(fromR, toR), mix(fromG, toG), mix(fromB, toB));
  }

  private hexToRgb(color: string): [number, number, number] {
    const hex = this.normalizeAccentColor(color).slice(1);
    return [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16)) as [number, number, number];
  }

  private rgbToHex(r: number, g: number, b: number): string {
    const toHex = (value: number) => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  private configureRainbowAccent(): void {
    if (this.settings.rainbowAccentEnabled) this.startRainbowAccent();
    else this.stopRainbowAccent(false);
    this.applyAccentToUi();
  }

  private startRainbowAccent(): void {
    if (this.rainbowAccentFrame !== null) return;
    this.rainbowAccentLastTick = 0;
    this.rainbowAccentLastColor = "";
    const tick = (timestamp: number) => {
      this.rainbowAccentFrame = window.requestAnimationFrame(tick);
      if (!this.settings.rainbowAccentEnabled) {
        this.stopRainbowAccent();
        return;
      }
      if (this.rainbowAccentLastTick > 0 && timestamp - this.rainbowAccentLastTick < RAINBOW_ACCENT_TICK_MS) return;
      this.rainbowAccentLastTick = timestamp;
      const color = this.getRainbowAccentColor();
      if (color === this.rainbowAccentLastColor) return;
      this.rainbowAccentLastColor = color;
      this.applyAccentToUi();
    };
    this.rainbowAccentFrame = window.requestAnimationFrame(tick);
  }

  private stopRainbowAccent(applyStaticAccent = true): void {
    if (this.rainbowAccentFrame !== null) {
      window.cancelAnimationFrame(this.rainbowAccentFrame);
      this.rainbowAccentFrame = null;
    }
    this.rainbowAccentLastTick = 0;
    this.rainbowAccentLastColor = "";
    if (applyStaticAccent) this.applyAccentToUi();
  }

  private normalizeAccentColor(value: unknown): string {
    const color = String(value || "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(color) ? color.toLowerCase() : DEFAULT_ACCENT_COLOR;
  }

  private getOnAccentColor(color: string): "#ffffff" | "#08111f" {
    const normalized = this.normalizeAccentColor(color);
    const cached = this.onAccentColorCache.get(normalized);
    if (cached) return cached;
    const accentLum = this.getRelativeLuminance(normalized);
    const whiteContrast = this.getContrastRatio(accentLum, 1);
    const inkContrast = this.getContrastRatio(accentLum, this.getRelativeLuminance("#08111f"));
    const onAccent = whiteContrast >= 4.5 || whiteContrast >= inkContrast ? "#ffffff" : "#08111f";
    this.onAccentColorCache.set(normalized, onAccent);
    return onAccent;
  }

  private getContrastRatio(leftLum: number, rightLum: number): number {
    const lighter = Math.max(leftLum, rightLum);
    const darker = Math.min(leftLum, rightLum);
    return (lighter + 0.05) / (darker + 0.05);
  }

  private getRelativeLuminance(color: string): number {
    const hex = this.normalizeAccentColor(color).slice(1);
    const [r, g, b] = [0, 2, 4].map((index) => {
      const channel = parseInt(hex.slice(index, index + 2), 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
  }

  async activateView(): Promise<void> {
    this.rememberActiveMarkdownEditor();
    const existingLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_SCIENTIFIC_CALCULATOR);
    let leaf: WorkspaceLeaf | null = existingLeaves[0] ?? null;

    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE_SCIENTIFIC_CALCULATOR, active: true });
    }

    this.app.workspace.revealLeaf(leaf);
  }

  refreshViews(): void {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_SCIENTIFIC_CALCULATOR).forEach((leaf) => {
      const view = leaf.view;
      if (view instanceof ScientificCalculatorView) view.refreshFromSettings();
    });
  }

  evaluateExpression(expression: string): EvaluationResult {
    return this.commandEngine.evaluate(expression, {
      angleMode: this.settings.angleMode,
      complexMode: this.settings.complexMode,
      precision: this.settings.precision,
      exactFractionMode: this.settings.exactFractionMode
    });
  }

  buildLatexEquation(expression: string, result: EvaluationResult | null = null): string {
    return formatLatexEquation(expression, result, { angleMode: this.settings.angleMode });
  }

  buildLatexBlock(expression: string, result: EvaluationResult | null = null): string {
    return formatObsidianLatexBlock(this.buildLatexEquation(expression, result));
  }

  insertIntoActiveEditor(markdown: string): boolean {
    const editor = this.getTargetMarkdownEditor();
    if (!editor) {
      new Notice("No active Markdown note found. Focus a note first, then insert again.");
      return false;
    }

    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);
    const before = line.slice(0, cursor.ch);
    const after = line.slice(cursor.ch);
    const prefix = before.trim().length > 0 ? "\n" : "";
    const suffix = after.trim().length > 0 ? "\n" : "";
    editor.replaceRange(`${prefix}${markdown}${suffix}`, cursor);
    this.lastMarkdownEditor = editor;
    return true;
  }

  private rememberActiveMarkdownEditor(): void {
    const editor = this.getActiveMarkdownEditor();
    if (editor) this.lastMarkdownEditor = editor;
  }

  private getTargetMarkdownEditor(): Editor | null {
    return this.getActiveMarkdownEditor() ?? this.lastMarkdownEditor;
  }


  getActiveMarkdownEditor(): Editor | null {
    return this.app.workspace.getActiveViewOfType(MarkdownView)?.editor ?? null;
  }
}

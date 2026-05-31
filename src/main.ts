import { MarkdownView, Notice, Plugin, WorkspaceLeaf, type Editor } from "obsidian";
import { VIEW_TYPE_SCIENTIFIC_CALCULATOR } from "./constants";
import { DEFAULT_SETTINGS, CalculatorPluginSettings, CalculatorSettingTab } from "./settings";
import { ScientificCalculatorView } from "./view/CalculatorView";
import { CalculatorEngine, EvaluationResult } from "./engine/CalculatorEngine";
import { formatLatexEquation, formatObsidianLatexBlock } from "./engine/latex";

export default class ScientificCalculatorPlugin extends Plugin {
  settings: CalculatorPluginSettings = { ...DEFAULT_SETTINGS };
  private readonly commandEngine = new CalculatorEngine();
  private lastMarkdownEditor: Editor | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(
      VIEW_TYPE_SCIENTIFIC_CALCULATOR,
      (leaf) => new ScientificCalculatorView(leaf, this)
    );

    this.addRibbonIcon("calculator", "Calculator Open", async () => {
      await this.activateView();
    });

    this.addCommand({
      id: "open",
      name: "Calculator Open",
      callback: async () => this.activateView()
    });

    this.addCommand({
      id: "reset",
      name: "Calculator Reset",
      callback: () => {
        this.app.workspace.getLeavesOfType(VIEW_TYPE_SCIENTIFIC_CALCULATOR).forEach((leaf) => {
          const view = leaf.view;
          if (view instanceof ScientificCalculatorView) view.resetCalculator();
        });
        new Notice("Calculator reset.");
      }
    });

    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.rememberActiveMarkdownEditor()));
    this.rememberActiveMarkdownEditor();

    this.addSettingTab(new CalculatorSettingTab(this.app, this));
  }

  async loadSettings(): Promise<void> {
    const loaded = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded, {
      history: Array.isArray(loaded?.history) ? loaded.history : []
    });
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
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

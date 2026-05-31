import { ItemView, Notice, setIcon, WorkspaceLeaf } from "obsidian";
import type ScientificCalculatorPlugin from "../main";
import { VIEW_TYPE_SCIENTIFIC_CALCULATOR } from "../constants";
import { CalculatorEngine, EvaluationResult } from "../engine/CalculatorEngine";
import { CalculatorError, Complex } from "../engine/Complex";
import { formatComplex } from "../engine/format";
import { displayToLatex, expressionToLatex, formatObsidianLatexBlock } from "../engine/latex";
import { DEFAULT_SETTINGS, StoredHistoryEntry } from "../settings";
import { CalculatorHelpModal } from "../ui/CalculatorHelpModal";

const FEEDBACK_URL = "https://ko-fi.com/i/IS6Y120HTC4";

interface ButtonSpec {
  label: string;
  insert?: string;
  action?:
    | "clear"
    | "backspace"
    | "evaluate"
    | "fraction"
    | "toggle-sign"
    | "memory-menu"
    | "memory-clear"
    | "memory-recall"
    | "memory-add"
    | "memory-subtract";
  variant?: "primary" | "operator" | "function" | "ghost" | "danger";
  wide?: boolean;
  title?: string;
  heading?: boolean;
}

interface HistoryEntry {
  expression: string;
  display: string;
  fraction: string | null;
  timestamp: number;
  result?: EvaluationResult | null;
}

type KeypadTab = "main" | "func" | "abc" | "const";

export class ScientificCalculatorView extends ItemView {
  private readonly engine = new CalculatorEngine();
  private expression = "";
  private result: EvaluationResult | null = null;
  private history: HistoryEntry[] = [];
  private activeTab: KeypadTab = "main";
  private memory = Complex.ZERO;

  private shellEl!: HTMLElement;
  private displayEl!: HTMLElement;
  private expressionEl!: HTMLInputElement;
  private resultEl!: HTMLElement;
  private fractionEl!: HTMLElement;
  private errorEl!: HTMLElement;
  private historyEl!: HTMLElement;
  private keypadEl!: HTMLElement;
  private quickbarEl!: HTMLElement;
  private memoryMenuEl!: HTMLElement;
  private tabsEl!: HTMLElement;
  private memoryEl!: HTMLElement;
  private degButton!: HTMLButtonElement;
  private radButton!: HTMLButtonElement;
  private complexButton!: HTMLButtonElement;
  private compactButton!: HTMLButtonElement;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: ScientificCalculatorPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_SCIENTIFIC_CALCULATOR;
  }

  getDisplayText(): string {
    return "Calculator Pro";
  }

  getIcon(): string {
    return "calculator";
  }

  async onOpen(): Promise<void> {
    this.loadHistoryFromSettings();
    this.render();
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  refreshFromSettings(): void {
    this.loadHistoryFromSettings();
    this.updateModeButtons();
    this.updateShellMode();
    this.renderHistory();
    this.renderQuickbar();
    this.renderKeypad();
    this.updateDisplay();
  }

  resetCalculator(): void {
    this.expression = "";
    this.result = null;
    this.history = [];
    this.memory = Complex.ZERO;
    this.engine.clearAns();
    this.syncExpressionInput();
    this.updateDisplay();
    this.renderHistory();
    this.persistHistory();
    this.updateMemoryDisplay();
  }

  private render(): void {
    this.contentEl.empty();
    this.contentEl.addClass("msc-view");

    this.shellEl = this.contentEl.createDiv({ cls: "msc-shell" });
    this.shellEl.tabIndex = 0;

    const header = this.shellEl.createDiv({ cls: "msc-header" });
    const titleWrap = header.createDiv({ cls: "msc-title-wrap" });
    titleWrap.createDiv({ cls: "msc-eyebrow", text: this.getVaultLabel() });
    titleWrap.createEl("h2", { cls: "msc-title", text: "Calculator Pro" });

    const controls = header.createDiv({ cls: "msc-controls" });
    const angleButtons = this.createControlGroup(controls, "Angle", "Trig only");
    this.degButton = this.createModeButton(angleButtons, "DEG", async () => this.setAngleMode("deg"), "Use degrees for sin/cos/tan.");
    this.radButton = this.createModeButton(angleButtons, "RAD", async () => this.setAngleMode("rad"), "Use radians for sin/cos/tan.");

    const complexButtons = this.createControlGroup(controls, "Complex", "i, roots");
    this.complexButton = this.createModeButton(complexButtons, "Off", async () => this.toggleComplexMode(), "Enable i and complex results.");

    const viewButtons = this.createControlGroup(controls, "View", "Pad");
    this.compactButton = this.createModeButton(viewButtons, "Full", async () => this.toggleKeypadMode(), "Switch between full and compact mathpad.");

    const feedbackButton = controls.createEl("button", {
      cls: "msc-feedback-button",
      attr: { type: "button", title: "Send feedback / support this plugin", "aria-label": "Open feedback and support page" }
    });
    setIcon(feedbackButton, "message-circle");
    feedbackButton.createSpan({ cls: "msc-feedback-label", text: "Feedback" });
    this.registerDomEvent(feedbackButton, "click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await this.openFeedbackLink();
    });

    const helpButton = controls.createEl("button", {
      cls: "msc-help-button",
      text: "?",
      attr: { type: "button", title: "What do these controls mean?", "aria-label": "Open calculator help" }
    });
    this.registerDomEvent(helpButton, "click", (event) => {
      event.preventDefault();
      new CalculatorHelpModal(this.app).open();
    });

    this.displayEl = this.shellEl.createDiv({ cls: "msc-display" });
    this.historyEl = this.displayEl.createDiv({ cls: "msc-history" });

    const expressionRow = this.displayEl.createDiv({ cls: "msc-expression-row" });
    this.expressionEl = expressionRow.createEl("input", {
      cls: "msc-expression-input",
      attr: {
        type: "text",
        inputmode: "decimal",
        autocomplete: "off",
        autocapitalize: "off",
        spellcheck: "false",
        "aria-label": "Calculator Pro expression"
      }
    });
    this.expressionEl.value = this.expression;

    this.resultEl = this.displayEl.createDiv({ cls: "msc-result", text: "0" });
    this.fractionEl = this.displayEl.createDiv({ cls: "msc-fraction" });
    this.memoryEl = this.displayEl.createDiv({ cls: "msc-memory" });
    this.errorEl = this.displayEl.createDiv({ cls: "msc-error" });

    this.quickbarEl = this.shellEl.createDiv({ cls: "msc-quickbar" });
    this.memoryMenuEl = this.shellEl.createDiv({ cls: "msc-memory-menu", attr: { "aria-hidden": "true" } });

    this.tabsEl = this.shellEl.createDiv({ cls: "msc-tabs" });
    this.createTabButton(this.tabsEl, "main", "Main");
    this.createTabButton(this.tabsEl, "func", "Sci");
    this.createTabButton(this.tabsEl, "const", "Constants");
    this.createTabButton(this.tabsEl, "abc", "ABC");

    this.keypadEl = this.shellEl.createDiv({ cls: "msc-keypad" });

    this.registerDomEvent(this.expressionEl, "input", () => {
      this.expression = this.expressionEl.value;
      this.result = null;
      this.updateDisplay();
    });
    this.registerDomEvent(this.expressionEl, "keydown", (event) => this.handleInputKeydown(event));
    this.registerDomEvent(this.shellEl, "keydown", (event) => this.handleKeydown(event));
    this.registerDomEvent(this.shellEl, "click", (event) => {
      if (event.target instanceof HTMLButtonElement) this.expressionEl.focus();
    });

    this.updateModeButtons();
    this.updateShellMode();
    this.updateMemoryDisplay();
    this.renderHistory();
    this.renderQuickbar();
    this.renderMemoryMenu();
    this.renderKeypad();
    this.updateDisplay();
    this.expressionEl.focus();
  }

  private getVaultLabel(): string {
    const vault = this.app.vault as unknown as { getName?: () => string };
    const name = vault.getName?.();
    return name?.trim() ? name : "Vault";
  }

  private createControlGroup(parent: HTMLElement, label: string, hint: string): HTMLElement {
    const group = parent.createDiv({ cls: "msc-control-group" });
    const meta = group.createDiv({ cls: "msc-control-meta" });
    meta.createSpan({ cls: "msc-control-label", text: label });
    meta.createSpan({ cls: "msc-control-hint", text: hint });
    return group.createDiv({ cls: "msc-control-buttons" });
  }

  private createModeButton(parent: HTMLElement, text: string, callback: () => void | Promise<void>, title: string): HTMLButtonElement {
    const button = parent.createEl("button", {
      cls: "msc-mode-button",
      text,
      attr: { type: "button", title, "aria-label": title }
    });
    this.registerDomEvent(button, "click", async (event) => {
      event.preventDefault();
      await callback();
    });
    return button;
  }

  private async openFeedbackLink(): Promise<void> {
    try {
      window.open(FEEDBACK_URL, "_blank", "noopener,noreferrer");
    } catch (error) {
      try {
        await navigator.clipboard.writeText(FEEDBACK_URL);
        new Notice("Could not open the feedback page. Link copied instead.");
      } catch {
        const message = error instanceof Error ? error.message : String(error);
        new Notice(`Could not open feedback page: ${message}`);
      }
    }
  }

  private createTabButton(parent: HTMLElement, tab: KeypadTab, label: string): void {
    const button = parent.createEl("button", {
      cls: "msc-tab",
      text: label,
      attr: { type: "button", "aria-label": `${label} keypad tab` }
    });
    button.dataset.tab = tab;
    this.registerDomEvent(button, "click", () => {
      this.activeTab = tab;
      parent.querySelectorAll(".msc-tab").forEach((el) => el.removeClass("is-active"));
      button.addClass("is-active");
      this.renderQuickbar();
      this.renderKeypad();
    });
    if (tab === this.activeTab) button.addClass("is-active");
  }

  private async setAngleMode(mode: "deg" | "rad"): Promise<void> {
    this.plugin.settings.angleMode = mode;
    if (mode === "deg" && this.plugin.settings.complexMode) {
      this.plugin.settings.complexMode = false;
      new Notice("Complex mode turned off because it uses radians.");
    }
    await this.plugin.saveSettings();
    this.updateModeButtons();
  }

  private async toggleComplexMode(): Promise<void> {
    this.plugin.settings.complexMode = !this.plugin.settings.complexMode;
    if (this.plugin.settings.complexMode) this.plugin.settings.angleMode = "rad";
    await this.plugin.saveSettings();
    this.updateModeButtons();
  }

  private async toggleKeypadMode(): Promise<void> {
    this.plugin.settings.keypadMode = this.isCompact() ? "full" : "compact";
    await this.plugin.saveSettings();
    this.updateShellMode();
    this.updateModeButtons();
    this.renderQuickbar();
    this.renderKeypad();
  }

  private isCompact(): boolean {
    return this.plugin.settings.keypadMode === "compact";
  }

  private updateShellMode(): void {
    if (!this.shellEl) return;
    this.shellEl.toggleClass("is-compact", this.isCompact());
  }

  private updateModeButtons(): void {
    if (!this.degButton || !this.radButton || !this.complexButton || !this.compactButton) return;
    this.degButton.toggleClass("is-active", this.plugin.settings.angleMode === "deg" && !this.plugin.settings.complexMode);
    this.radButton.toggleClass("is-active", this.plugin.settings.angleMode === "rad" || this.plugin.settings.complexMode);
    this.complexButton.toggleClass("is-active", this.plugin.settings.complexMode);
    this.complexButton.setText(this.plugin.settings.complexMode ? "On" : "Off");
    this.compactButton.toggleClass("is-active", this.isCompact());
    this.compactButton.setText(this.isCompact() ? "Compact" : "Full");
    this.degButton.toggleClass("is-disabled", this.plugin.settings.complexMode);
    this.degButton.title = this.plugin.settings.complexMode ? "Complex mode uses radians." : "Use degrees for sin/cos/tan.";
    this.radButton.title = "Use radians for sin/cos/tan.";
    this.complexButton.title = this.plugin.settings.complexMode ? "Complex mode is on. Click to turn off." : "Enable i and complex results.";
  }

  private renderQuickbar(): void {
    this.closeMemoryMenu();
    this.quickbarEl.empty();
    const buttons = this.isCompact() ? this.getCompactQuickbarButtons() : this.getQuickbarButtons();
    for (const spec of buttons) {
      const chip = this.quickbarEl.createEl("button", {
        cls: ["msc-chip", spec.variant ? `msc-chip-${spec.variant}` : ""].filter(Boolean).join(" "),
        text: spec.label,
        attr: { type: "button", title: spec.title ?? spec.label, "aria-label": spec.title ?? spec.label }
      });
      this.registerDomEvent(chip, "click", (event) => {
        event.preventDefault();
        this.handleButton(spec);
      });
    }
  }

  private renderMemoryMenu(): void {
    this.memoryMenuEl.empty();
    const buttons: ButtonSpec[] = [
      { label: "MC", action: "memory-clear", variant: "ghost", title: "Clear memory" },
      { label: "MR", action: "memory-recall", variant: "ghost", title: "Recall memory" },
      { label: "M+", action: "memory-add", variant: "ghost", title: "Add current value to memory" },
      { label: "M−", action: "memory-subtract", variant: "ghost", title: "Subtract current value from memory" }
    ];

    for (const spec of buttons) {
      const button = this.memoryMenuEl.createEl("button", {
        cls: "msc-memory-option",
        text: spec.label,
        attr: { type: "button", title: spec.title ?? spec.label, "aria-label": spec.title ?? spec.label }
      });
      this.registerDomEvent(button, "click", (event) => {
        event.preventDefault();
        this.handleButton(spec);
      });
    }
  }

  private getQuickbarButtons(): ButtonSpec[] {
    if (this.activeTab !== "main") return [];
    return [
      { label: "(", insert: "(", variant: "ghost" },
      { label: ")", insert: ")", variant: "ghost" },
      { label: "Ans", insert: "ans", variant: "function" },
      { label: "a/b", action: "fraction", variant: "function", title: "Convert result to fraction, or insert /" },
      { label: "π", insert: "pi", variant: "function" },
      { label: "e", insert: "e", variant: "function" },
      { label: "x²", insert: "^2", variant: "function" },
      { label: "xʸ", insert: "^", variant: "function" },
      { label: "√", insert: "sqrt(", variant: "function" },
      { label: "M", action: "memory-menu", variant: "ghost", title: "Memory actions" }
    ];
  }

  private getCompactQuickbarButtons(): ButtonSpec[] {
    return [
      { label: "(", insert: "(", variant: "ghost" },
      { label: ")", insert: ")", variant: "ghost" },
      { label: "Ans", insert: "ans", variant: "function" },
      { label: "a/b", action: "fraction", variant: "function", title: "Convert result to fraction, or insert /" },
      { label: "π", insert: "pi", variant: "function" },
      { label: "√", insert: "sqrt(", variant: "function" },
      { label: "xʸ", insert: "^", variant: "function" },
      { label: "M", action: "memory-menu", variant: "ghost", title: "Memory actions" }
    ];
  }

  private renderKeypad(): void {
    this.keypadEl.empty();
    const buttons = this.getButtonsForTab(this.activeTab);
    for (const spec of buttons) {
      if (spec.heading) {
        this.keypadEl.createDiv({ cls: "msc-key-heading", text: spec.label });
        continue;
      }

      const button = this.keypadEl.createEl("button", {
        cls: ["msc-key", spec.variant ? `msc-key-${spec.variant}` : ""].filter(Boolean).join(" "),
        text: spec.label,
        attr: { type: "button", title: spec.title ?? spec.label, "aria-label": spec.title ?? spec.label }
      });
      if (spec.wide) button.addClass("is-wide");
      this.registerDomEvent(button, "click", (event) => {
        event.preventDefault();
        this.handleButton(spec);
      });
    }
  }

  private getButtonsForTab(tab: KeypadTab): ButtonSpec[] {
    if (this.isCompact()) return this.getCompactButtons();

    if (tab === "func") return this.getFunctionButtons();
    if (tab === "const") return this.getConstantButtons();
    if (tab === "abc") return this.getAlphabetButtons();
    return this.getMainButtons();
  }

  private getMainButtons(): ButtonSpec[] {
    return [
      { label: "AC", action: "clear", variant: "danger" },
      { label: "⌫", action: "backspace", variant: "ghost", title: "Backspace" },
      { label: "%", insert: "%", variant: "function" },
      { label: "÷", insert: "/", variant: "operator" },
      { label: "7", insert: "7" },
      { label: "8", insert: "8" },
      { label: "9", insert: "9" },
      { label: "×", insert: "*", variant: "operator" },
      { label: "4", insert: "4" },
      { label: "5", insert: "5" },
      { label: "6", insert: "6" },
      { label: "−", insert: "-", variant: "operator" },
      { label: "1", insert: "1" },
      { label: "2", insert: "2" },
      { label: "3", insert: "3" },
      { label: "+", insert: "+", variant: "operator" },
      { label: "±", action: "toggle-sign", variant: "function" },
      { label: "0", insert: "0" },
      { label: ".", insert: "." },
      { label: "=", action: "evaluate", variant: "primary" }
    ];
  }

  private getFunctionButtons(): ButtonSpec[] {
    return [
      { label: "Trigonometry", heading: true },
      { label: "sin", insert: "sin(", variant: "function" },
      { label: "cos", insert: "cos(", variant: "function" },
      { label: "tan", insert: "tan(", variant: "function" },
      { label: "asin", insert: "asin(", variant: "function" },
      { label: "acos", insert: "acos(", variant: "function" },
      { label: "atan", insert: "atan(", variant: "function" },

      { label: "Powers & logs", heading: true },
      { label: "x²", insert: "^2", variant: "function" },
      { label: "xʸ", insert: "^", variant: "function" },
      { label: "√", insert: "sqrt(", variant: "function" },
      { label: "ⁿ√", insert: "nthroot(", variant: "function", title: "nthroot(value, root)" },
      { label: "log", insert: "log(", variant: "function" },
      { label: "ln", insert: "ln(", variant: "function" },
      { label: "exp", insert: "exp(", variant: "function" },
      { label: "x!", insert: "!", variant: "function" },

      { label: "Stats & counting", heading: true },
      { label: "mean", insert: "mean(", variant: "function" },
      { label: "median", insert: "median(", variant: "function" },
      { label: "stdev", insert: "stdev(", variant: "function" },
      { label: "stdevp", insert: "stdevp(", variant: "function" },
      { label: "var", insert: "var(", variant: "function" },
      { label: "varp", insert: "varp(", variant: "function" },
      { label: "mad", insert: "mad(", variant: "function" },
      { label: "total", insert: "total(", variant: "function" },
      { label: "count", insert: "count(", variant: "function" },
      { label: "[ ]", insert: "[", variant: "function", title: "Start a list, e.g. mean([1,2,3])" },
      { label: "nCr", insert: "nCr(", variant: "function" },
      { label: "nPr", insert: "nPr(", variant: "function" },
      { label: "sum", insert: "sum(", variant: "function" },
      { label: "cov", insert: "cov(", variant: "function" },
      { label: "corr", insert: "corr(", variant: "function" },
      { label: "min", insert: "min(", variant: "function" },
      { label: "max", insert: "max(", variant: "function" },

      { label: "Complex", heading: true },
      { label: "i", insert: "i", variant: "function" },
      { label: "real", insert: "real(", variant: "function" },
      { label: "imag", insert: "imag(", variant: "function" },
      { label: "conj", insert: "conj(", variant: "function" },
      { label: "arg", insert: "arg(", variant: "function" },
      { label: "abs", insert: "abs(", variant: "function" },
      { label: "|x|", insert: "|", variant: "function" },

      { label: "Rounding & temperature", heading: true },
      { label: "round", insert: "round(", variant: "function" },
      { label: "floor", insert: "floor(", variant: "function" },
      { label: "ceil", insert: "ceil(", variant: "function" },
      { label: "°C→°F", insert: "ctof(", variant: "function" },
      { label: "°F→°C", insert: "ftoc(", variant: "function" },
      { label: "°C→K", insert: "ctok(", variant: "function" },
      { label: "K→°C", insert: "ktoc(", variant: "function" },
      { label: "K→°F", insert: "ktof(", variant: "function" }
    ];
  }

  private getConstantButtons(): ButtonSpec[] {
    return [
      { label: "Math", heading: true },
      { label: "π", insert: "pi", variant: "function", title: "pi" },
      { label: "τ", insert: "tau", variant: "function", title: "tau = 2π" },
      { label: "e", insert: "e", variant: "function" },
      { label: "φ", insert: "phi", variant: "function", title: "golden ratio" },

      { label: "Physics", heading: true },
      { label: "c", insert: "c", variant: "function", title: "speed of light" },
      { label: "g₀", insert: "gravity", variant: "function", title: "standard gravity" },
      { label: "Nₐ", insert: "avogadro", variant: "function" },
      { label: "k", insert: "boltzmann", variant: "function" },
      { label: "h", insert: "planck", variant: "function" },

      { label: "Length", heading: true },
      { label: "m", insert: "m", variant: "ghost" },
      { label: "km", insert: "km", variant: "ghost" },
      { label: "cm", insert: "cm", variant: "ghost" },
      { label: "mm", insert: "mm", variant: "ghost" },
      { label: "mi", insert: "mi", variant: "ghost" },
      { label: "ft", insert: "ft", variant: "ghost" },
      { label: "inch", insert: "inch", variant: "ghost" },

      { label: "Mass & time", heading: true },
      { label: "kg", insert: "kg", variant: "ghost" },
      { label: "g", insert: "g", variant: "ghost" },
      { label: "lb", insert: "lb", variant: "ghost" },
      { label: "oz", insert: "oz", variant: "ghost" },
      { label: "sec", insert: "sec", variant: "ghost" },
      { label: "min", insert: "min", variant: "ghost" },
      { label: "hr", insert: "hr", variant: "ghost" },
      { label: "day", insert: "day", variant: "ghost" }
    ];
  }

  private getAlphabetButtons(): ButtonSpec[] {
    return [
      ..."abcdef".split("").map((letter) => ({ label: letter, insert: letter, variant: "ghost" as const })),
      ..."ghijkl".split("").map((letter) => ({ label: letter, insert: letter, variant: "ghost" as const })),
      ..."mnopqr".split("").map((letter) => ({ label: letter, insert: letter, variant: "ghost" as const })),
      ..."stuvwx".split("").map((letter) => ({ label: letter, insert: letter, variant: "ghost" as const })),
      { label: "y", insert: "y", variant: "ghost" },
      { label: "z", insert: "z", variant: "ghost" },
      { label: ",", insert: ",", variant: "operator" },
      { label: "π", insert: "pi", variant: "function" },
      { label: "e", insert: "e", variant: "function" },
      { label: "i", insert: "i", variant: "function" }
    ];
  }

  private getCompactButtons(): ButtonSpec[] {
    return [
      { label: "AC", action: "clear", variant: "danger" },
      { label: "⌫", action: "backspace", variant: "ghost" },
      { label: "%", insert: "%", variant: "function" },
      { label: "÷", insert: "/", variant: "operator" },
      { label: "7", insert: "7" },
      { label: "8", insert: "8" },
      { label: "9", insert: "9" },
      { label: "×", insert: "*", variant: "operator" },
      { label: "4", insert: "4" },
      { label: "5", insert: "5" },
      { label: "6", insert: "6" },
      { label: "−", insert: "-", variant: "operator" },
      { label: "1", insert: "1" },
      { label: "2", insert: "2" },
      { label: "3", insert: "3" },
      { label: "+", insert: "+", variant: "operator" },
      { label: "±", action: "toggle-sign", variant: "function" },
      { label: "0", insert: "0" },
      { label: ".", insert: "." },
      { label: "=", action: "evaluate", variant: "primary" }
    ];
  }

  private handleButton(spec: ButtonSpec): void {
    this.errorEl.setText("");
    if (spec.action) {
      this.handleAction(spec.action);
      return;
    }
    if (spec.insert) {
      this.closeMemoryMenu();
      this.insert(spec.insert);
    }
  }

  private handleAction(action: NonNullable<ButtonSpec["action"]>): void {
    if (action !== "memory-menu") this.closeMemoryMenu();
    switch (action) {
      case "clear":
        this.expression = "";
        this.result = null;
        this.engine.clearAns();
        this.syncExpressionInput();
        this.updateDisplay();
        return;
      case "backspace":
        this.backspace();
        return;
      case "evaluate":
        this.evaluate();
        return;
      case "fraction":
        if (this.result?.fraction) {
          this.expression = this.result.fraction;
          this.syncExpressionInput(this.expression.length);
        } else {
          this.insert("/");
        }
        this.updateDisplay();
        return;
      case "toggle-sign":
        this.toggleSign();
        return;
      case "memory-menu":
        this.toggleMemoryMenu();
        return;
      case "memory-clear":
        this.memory = Complex.ZERO;
        this.updateMemoryDisplay();
        new Notice("Memory cleared.");
        return;
      case "memory-recall":
        this.insert(formatComplex(this.memory, this.plugin.settings.precision));
        return;
      case "memory-add":
        this.updateMemory("add");
        return;
      case "memory-subtract":
        this.updateMemory("subtract");
        return;
    }
  }

  private toggleMemoryMenu(): void {
    if (!this.memoryMenuEl) return;
    const shouldOpen = !this.memoryMenuEl.classList.contains("is-open");
    this.memoryMenuEl.toggleClass("is-open", shouldOpen);
    this.memoryMenuEl.setAttribute("aria-hidden", String(!shouldOpen));
  }

  private closeMemoryMenu(): void {
    if (!this.memoryMenuEl) return;
    this.memoryMenuEl.removeClass("is-open");
    this.memoryMenuEl.setAttribute("aria-hidden", "true");
  }

  private insert(text: string): void {
    const start = this.expressionEl.selectionStart ?? this.expression.length;
    const end = this.expressionEl.selectionEnd ?? this.expression.length;
    this.expression = `${this.expression.slice(0, start)}${text}${this.expression.slice(end)}`;
    this.result = null;
    this.syncExpressionInput(start + text.length);
    this.updateDisplay();
  }

  private backspace(): void {
    const start = this.expressionEl.selectionStart ?? this.expression.length;
    const end = this.expressionEl.selectionEnd ?? this.expression.length;
    if (start !== end) {
      this.expression = `${this.expression.slice(0, start)}${this.expression.slice(end)}`;
      this.syncExpressionInput(start);
    } else if (start > 0) {
      this.expression = `${this.expression.slice(0, start - 1)}${this.expression.slice(start)}`;
      this.syncExpressionInput(start - 1);
    }
    this.result = null;
    this.updateDisplay();
  }

  private toggleSign(): void {
    const start = this.expressionEl.selectionStart ?? 0;
    const end = this.expressionEl.selectionEnd ?? this.expression.length;
    if (start !== end) {
      const selected = this.expression.slice(start, end);
      const replacement = `-(${selected})`;
      this.expression = `${this.expression.slice(0, start)}${replacement}${this.expression.slice(end)}`;
      this.syncExpressionInput(start + replacement.length);
    } else if (!this.expression) {
      this.expression = "-";
      this.syncExpressionInput(1);
    } else {
      this.expression = `-(${this.expression})`;
      this.syncExpressionInput(this.expression.length);
    }
    this.result = null;
    this.updateDisplay();
  }

  private evaluate(): void {
    const expression = this.expression.trim();
    if (!expression) return;

    try {
      this.result = this.engine.evaluate(expression, this.getEngineSettings());
      this.expression = this.result.display;
      this.syncExpressionInput(this.expression.length);
      this.addHistory({
        expression,
        display: this.result.display,
        fraction: this.result.fraction,
        timestamp: Date.now(),
        result: this.result
      });
      this.errorEl.setText("");
      this.renderHistory();
      this.updateDisplay();
    } catch (error) {
      const message = error instanceof CalculatorError || error instanceof Error ? error.message : String(error);
      this.errorEl.setText(message);
    }
  }

  private getEngineSettings() {
    return {
      angleMode: this.plugin.settings.angleMode ?? DEFAULT_SETTINGS.angleMode,
      complexMode: this.plugin.settings.complexMode ?? DEFAULT_SETTINGS.complexMode,
      precision: this.plugin.settings.precision ?? DEFAULT_SETTINGS.precision,
      exactFractionMode: this.plugin.settings.exactFractionMode ?? DEFAULT_SETTINGS.exactFractionMode
    };
  }

  private updateDisplay(): void {
    const expressionText = this.expression || "0";
    this.expressionEl.placeholder = expressionText;
    const hasVisibleResult = Boolean(this.result && this.expression === this.result.display);
    this.displayEl?.toggleClass("has-result", hasVisibleResult);
    this.displayEl?.toggleClass("is-typing", !hasVisibleResult);

    if (hasVisibleResult && this.result) {
      this.resultEl.setText(this.result.display);
      const fractionText = this.result.exactFraction
        ? `exact ${this.result.exactFraction}`
        : this.result.fraction && this.result.fraction !== this.result.display
          ? `≈ ${this.result.fraction}`
          : "";
      this.fractionEl.setText(fractionText);
    } else {
      this.resultEl.setText("");
      this.fractionEl.setText("");
    }
  }

  private renderHistory(): void {
    this.historyEl.empty();
    for (const item of this.history.slice(0, 8)) {
      const row = this.historyEl.createDiv({ cls: "msc-history-row" });
      const body = row.createDiv({ cls: "msc-history-body" });
      body.createSpan({ cls: "msc-history-expression", text: item.expression });
      body.createSpan({ cls: "msc-history-result", text: item.display });

      const actions = row.createDiv({ cls: "msc-history-actions" });
      const copyButton = actions.createEl("button", {
        cls: "msc-history-action msc-history-action-copy",
        attr: {
          type: "button",
          "aria-label": "Copy full equation as Obsidian LaTeX",
          title: "Copy full equation as Obsidian LaTeX"
        }
      });
      setIcon(copyButton, "copy");

      const insertButton = actions.createEl("button", {
        cls: "msc-history-action msc-history-action-insert",
        attr: {
          type: "button",
          "aria-label": "Insert full equation into last active note cursor",
          title: "Insert full equation into last active note cursor"
        }
      });
      setIcon(insertButton, "corner-down-left");

      this.registerDomEvent(copyButton, "click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await this.copyHistoryLatexBlock(item);
      });
      this.registerDomEvent(insertButton, "click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.insertHistoryLatexBlock(item);
      });
      this.registerDomEvent(body, "click", () => {
        this.expression = item.expression;
        this.result = item.result ?? null;
        this.syncExpressionInput(this.expression.length);
        this.updateDisplay();
      });
    }
  }

  private addHistory(entry: HistoryEntry): void {
    const limit = this.plugin.settings.historyLimit ?? DEFAULT_SETTINGS.historyLimit;
    this.history = [entry, ...this.history].slice(0, limit);
    this.persistHistory();
  }

  private loadHistoryFromSettings(): void {
    if (!this.plugin.settings.persistentHistory) return;
    this.history = this.plugin.settings.history.map((entry) => ({
      expression: entry.expression,
      display: entry.display,
      fraction: entry.fraction,
      timestamp: entry.timestamp ?? Date.now(),
      result: null
    }));
  }

  private persistHistory(): void {
    if (!this.plugin.settings.persistentHistory) return;
    const limit = this.plugin.settings.historyLimit ?? DEFAULT_SETTINGS.historyLimit;
    this.plugin.settings.history = this.history.slice(0, limit).map((entry): StoredHistoryEntry => ({
      expression: entry.expression,
      display: entry.display,
      fraction: entry.fraction,
      timestamp: entry.timestamp
    }));
    void this.plugin.saveSettings();
  }

  private syncExpressionInput(cursor?: number): void {
    if (!this.expressionEl) return;
    this.expressionEl.value = this.expression;
    const position = cursor ?? this.expression.length;
    this.expressionEl.setSelectionRange(position, position);
    this.expressionEl.focus();
  }

  private buildHistoryLatexBlock(item: HistoryEntry): { block: string; equation: string } | null {
    const expression = item.expression.trim();
    if (!expression) return null;
    const lhs = expressionToLatex(expression, { angleMode: this.plugin.settings.angleMode });
    const rhs = displayToLatex(item.display);
    const equation = `${lhs} = ${rhs}`;
    return { equation, block: formatObsidianLatexBlock(equation) };
  }

  private async copyHistoryLatexBlock(item: HistoryEntry): Promise<void> {
    const latex = this.buildHistoryLatexBlock(item);
    if (!latex) return;
    try {
      await navigator.clipboard.writeText(latex.block);
      new Notice("Copied full LaTeX equation block.");
    } catch {
      new Notice("Could not copy LaTeX to clipboard.");
    }
  }

  private insertHistoryLatexBlock(item: HistoryEntry): void {
    const latex = this.buildHistoryLatexBlock(item);
    if (!latex) return;
    if (this.plugin.insertIntoActiveEditor(latex.block)) {
      new Notice("Inserted full LaTeX equation block.");
    }
  }

  private getCurrentValue(): Complex | null {
    if (this.result && this.expression === this.result.display) return this.result.value;
    const expression = this.expression.trim();
    if (!expression) return null;
    return this.engine.evaluate(expression, this.getEngineSettings()).value;
  }

  private updateMemory(operation: "add" | "subtract"): void {
    try {
      const value = this.getCurrentValue();
      if (!value) return;
      this.memory = operation === "add" ? this.memory.add(value) : this.memory.sub(value);
      this.updateMemoryDisplay();
      new Notice(`Memory: ${formatComplex(this.memory, this.plugin.settings.precision)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.errorEl.setText(message);
    }
  }

  private updateMemoryDisplay(): void {
    if (!this.memoryEl) return;
    this.memoryEl.setText(this.memory.isReal() && this.memory.re === 0 ? "" : `M ${formatComplex(this.memory, this.plugin.settings.precision)}`);
  }

  private handleInputKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" || event.key === "=") {
      event.preventDefault();
      this.evaluate();
    } else if (event.key === "Escape") {
      event.preventDefault();
      this.handleAction("clear");
    }
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (event.target === this.expressionEl) return;
    const key = event.key;

    if (key === "Enter" || key === "=") {
      event.preventDefault();
      this.evaluate();
      return;
    }
    if (key === "Backspace") {
      event.preventDefault();
      this.handleAction("backspace");
      return;
    }
    if (key === "Escape") {
      event.preventDefault();
      this.handleAction("clear");
      return;
    }

    const allowed = "0123456789.+-*/^(),[]|%!";
    if (allowed.includes(key)) {
      event.preventDefault();
      this.insert(key);
      return;
    }

    if (/^[a-zA-Z]$/u.test(key)) {
      event.preventDefault();
      this.insert(key);
    }
  }
}

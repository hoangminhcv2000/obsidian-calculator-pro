import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type ScientificCalculatorPlugin from "./main";

export type AngleMode = "deg" | "rad";
export type KeypadMode = "full" | "compact";

export interface StoredHistoryEntry {
  expression: string;
  display: string;
  fraction: string | null;
  timestamp: number;
}

export interface CalculatorPluginSettings {
  angleMode: AngleMode;
  complexMode: boolean;
  precision: number;
  historyLimit: number;
  persistentHistory: boolean;
  history: StoredHistoryEntry[];
  keypadMode: KeypadMode;
  exactFractionMode: boolean;
  accentColor: string;
  rainbowAccentEnabled: boolean;
  adaptiveThemeEnabled: boolean;
}

export const DEFAULT_ACCENT_COLOR = "#2f7cf6";
export const LEGACY_CUPERTINO_ACCENT_COLOR = "#a77f5d";

const ACCENT_COLOR_PRESETS = [
  { label: "Music Blue", color: DEFAULT_ACCENT_COLOR },
  { label: "Cupertino", color: LEGACY_CUPERTINO_ACCENT_COLOR },
  { label: "Sky", color: "#0a84ff" },
  { label: "Indigo", color: "#5e5ce6" },
  { label: "Violet", color: "#bf5af2" },
  { label: "Rose", color: "#ff4f9a" },
  { label: "Coral", color: "#ff6b4a" },
  { label: "Amber", color: "#ff9f0a" },
  { label: "Mint", color: "#32d74b" },
  { label: "Teal", color: "#30b0c7" },
  { label: "Graphite", color: "#8e8e93" }
] as const;

export const DEFAULT_SETTINGS: CalculatorPluginSettings = {
  angleMode: "deg",
  complexMode: false,
  precision: 12,
  historyLimit: 30,
  persistentHistory: false,
  history: [],
  keypadMode: "full",
  exactFractionMode: false,
  accentColor: DEFAULT_ACCENT_COLOR,
  rainbowAccentEnabled: false,
  adaptiveThemeEnabled: false
};

export class CalculatorSettingTab extends PluginSettingTab {
  plugin: ScientificCalculatorPlugin;

  constructor(app: App, plugin: ScientificCalculatorPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("calculator-pro-settings");
    this.plugin.applyAccentToElement(containerEl);

    const hero = containerEl.createDiv({ cls: "calculator-pro-settings-hero" });
    hero.createEl("h2", { text: "Calculator Pro" });
    hero.createEl("p", {
      text: "Preferences that are not already available in the calculator view. Use the calculator header to switch angle, complex, and view modes."
    });

    const appearance = this.createSettingsSection(
      containerEl,
      "Appearance",
      "Color and background. Fixed appearance keeps Calculator Pro readable across Obsidian themes.",
      "calculator-pro-appearance-settings"
    );

    new Setting(appearance)
      .setName("Accent Color")
      .setDesc("Choose the Calculator Pro color.")
      .addColorPicker((color) => {
        color.setValue(this.plugin.settings.accentColor);
        color.onChange(async (value) => {
          await this.plugin.setAccentColor(value);
        });
      })
      .addButton((button) => {
        button.setIcon("rotate-ccw");
        button.setTooltip("Reset Music Blue accent");
        button.buttonEl.addClass("calculator-pro-reset-accent-button");
        button.onClick(async () => {
          await this.plugin.setAccentColor(DEFAULT_ACCENT_COLOR);
          this.display();
        });
      });
    this.renderAccentColorPresets(appearance);

    const adaptiveThemeSetting = new Setting(appearance)
      .setName("Adaptive To Your Theme")
      .setDesc("Use Obsidian theme colors. Off keeps the fixed Calculator Pro dark blue look.");
    this.addBooleanButton(
      adaptiveThemeSetting,
      this.plugin.settings.adaptiveThemeEnabled,
      async (value) => this.plugin.setAdaptiveThemeEnabled(value),
      { refresh: true }
    );

    const rainbowSetting = new Setting(appearance)
      .setName("Rainbow")
      .setDesc("Slowly move Calculator Pro through soft colors.");
    this.addBooleanButton(rainbowSetting, this.plugin.settings.rainbowAccentEnabled, async (value) => {
      await this.plugin.setRainbowAccentEnabled(value);
    });

    const calculation = this.createSettingsSection(
      containerEl,
      "Calculation",
      "Precision and exact result behavior.",
      "calculator-pro-calculation-settings"
    );

    new Setting(calculation)
      .setName("Exact fraction mode")
      .setDesc("When possible, show exact rational results for arithmetic-only expressions such as 1/3 + 1/6.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.exactFractionMode).onChange(async (value) => {
          this.plugin.settings.exactFractionMode = value;
          await this.plugin.saveSettings();
          this.plugin.refreshViews();
        });
      });

    new Setting(calculation)
      .setName("Display precision")
      .setDesc("Significant digits shown in decimal results.")
      .addSlider((slider) => {
        slider
          .setLimits(6, 16, 1)
          .setValue(this.plugin.settings.precision)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.precision = value;
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
          });
      });

    const history = this.createSettingsSection(
      containerEl,
      "History",
      "How many equations are kept and whether they survive reloads.",
      "calculator-pro-history-settings"
    );

    new Setting(history)
      .setName("History limit")
      .setDesc("Maximum number of calculations kept in history.")
      .addSlider((slider) => {
        slider
          .setLimits(5, 100, 5)
          .setValue(this.plugin.settings.historyLimit)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.historyLimit = value;
            this.plugin.settings.history = this.plugin.settings.history.slice(0, value);
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
          });
      });

    new Setting(history)
      .setName("Persistent history")
      .setDesc("Keep calculator history after Obsidian reloads. Disable to keep history session-only.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.persistentHistory).onChange(async (value) => {
          this.plugin.settings.persistentHistory = value;
          if (!value) this.plugin.settings.history = [];
          await this.plugin.saveSettings();
          this.plugin.refreshViews();
          this.display();
        });
      });
  }

  private createSettingsSection(container: HTMLElement, title: string, description: string, cls = ""): HTMLElement {
    const section = container.createDiv({ cls: `calculator-pro-settings-section ${cls}`.trim() });
    const header = section.createDiv({ cls: "calculator-pro-settings-section-header" });
    header.createDiv({ cls: "calculator-pro-settings-section-title", text: title });
    if (description) header.createDiv({ cls: "calculator-pro-settings-section-desc", text: description });
    return section;
  }

  private addBooleanButton(
    setting: Setting,
    value: boolean,
    onChange: (value: boolean) => Promise<void> | void,
    options: { refresh?: boolean; onText?: string; offText?: string } = {}
  ): Setting {
    setting.addButton((button) => {
      button.buttonEl.addClass("calculator-pro-toggle-button");
      let current = Boolean(value);
      const render = () => {
        button.setButtonText(current ? (options.onText || "On") : (options.offText || "Off"));
        button.setIcon(current ? "check" : "minus");
        button.buttonEl.toggleClass("is-active", current);
        button.buttonEl.setAttr("aria-pressed", String(current));
      };
      render();
      button.onClick(async () => {
        current = !current;
        render();
        try {
          await onChange(current);
          if (options.refresh) this.display();
        } catch (error) {
          current = !current;
          render();
          new Notice(error instanceof Error ? error.message : String(error));
        }
      });
    });
    return setting;
  }

  private renderAccentColorPresets(container: HTMLElement): void {
    const palette = container.createDiv({
      cls: "calculator-pro-accent-palette",
      attr: { "aria-label": "Accent Color Presets" }
    });
    palette.createDiv({ cls: "calculator-pro-accent-palette-label", text: "Presets" });

    const current = this.plugin.settings.accentColor.toLowerCase();
    for (const preset of ACCENT_COLOR_PRESETS) {
      const isActive = current === preset.color;
      const swatch = palette.createEl("button", {
        cls: `calculator-pro-accent-swatch ${isActive ? "is-active" : ""}`,
        attr: {
          type: "button",
          "aria-label": `Use ${preset.label} Accent`,
          "aria-pressed": String(isActive)
        }
      });
      swatch.style.setProperty("--calculator-pro-swatch", preset.color);
      swatch.createSpan({ cls: "calculator-pro-accent-swatch-color" }).style.setProperty("background-color", preset.color);
      swatch.createSpan({ cls: "calculator-pro-accent-swatch-check" });
      swatch.addEventListener("click", async () => {
        await this.plugin.setAccentColor(preset.color);
        this.display();
      });
    }
  }
}

import { App, PluginSettingTab, Setting } from "obsidian";
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
}

export const DEFAULT_SETTINGS: CalculatorPluginSettings = {
  angleMode: "deg",
  complexMode: false,
  precision: 12,
  historyLimit: 30,
  persistentHistory: false,
  history: [],
  keypadMode: "full",
  exactFractionMode: false
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

    new Setting(containerEl)
      .setName("Calculator")
      .setHeading();

    containerEl.createEl("p", {
      text: "Defaults for the calculator view. Complex mode always uses radians."
    });

    new Setting(containerEl)
      .setName("Default angle mode")
      .setDesc("Used for trigonometric functions when complex mode is off.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("deg", "Degrees")
          .addOption("rad", "Radians")
          .setValue(this.plugin.settings.angleMode)
          .onChange(async (value) => {
            this.plugin.settings.angleMode = value as AngleMode;
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
          });
      });

    new Setting(containerEl)
      .setName("Complex mode")
      .setDesc("Enable i, complex roots, real(), imag(), conj(), and arg().")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.complexMode).onChange(async (value) => {
          this.plugin.settings.complexMode = value;
          if (value) this.plugin.settings.angleMode = "rad";
          await this.plugin.saveSettings();
          this.plugin.refreshViews();
          this.display();
        });
      });

    new Setting(containerEl)
      .setName("Exact fraction mode")
      .setDesc("When possible, show exact rational results for arithmetic-only expressions such as 1/3 + 1/6.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.exactFractionMode).onChange(async (value) => {
          this.plugin.settings.exactFractionMode = value;
          await this.plugin.saveSettings();
          this.plugin.refreshViews();
        });
      });

    new Setting(containerEl)
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

    new Setting(containerEl)
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

    new Setting(containerEl)
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

    new Setting(containerEl)
      .setName("Default keypad")
      .setDesc("Choose the default keypad density.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("full", "Full scientific")
          .addOption("compact", "Compact")
          .setValue(this.plugin.settings.keypadMode)
          .onChange(async (value) => {
            this.plugin.settings.keypadMode = value as "full" | "compact";
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
          });
      });
  }
}

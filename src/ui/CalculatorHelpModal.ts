import { App, Modal } from "obsidian";

export class CalculatorHelpModal extends Modal {
  constructor(app: App) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("msc-help-modal");

    contentEl.createEl("h2", { text: "Calculator help" });
    contentEl.createEl("p", {
      text: "The controls are independent: Angle changes trigonometry, Complex enables imaginary numbers, and View changes keypad density."
    });

    this.addSection("Angle", [
      "DEG: sin(30) means sin(30°), so the result is 0.5.",
      "RAD: sin(pi / 2) means sin(π/2 radians), so the result is 1.",
      "DEG/RAD only affect sin, cos, tan, and inverse trig functions."
    ]);

    this.addSection("Complex", [
      "Turn this on when you need i or complex results.",
      "Examples: i * i = -1, sqrt(-4) = 2i.",
      "Complex mode uses radians for trig by design."
    ]);

    this.addSection("Mathpad", [
      "Main is intentionally simple for everyday arithmetic.",
      "Use the quick tools row for Ans, π, powers, roots, fractions, and memory.",
      "Use Sci and Constants tabs for less-common functions.",
      "Lists use brackets: mean([2,4,6]), median([1,5,9]), corr([1,2,3], [2,4,6])."
    ]);

    this.addSection("Units", [
      "Unit names are multipliers. Example: 5km / m = 5000.",
      "Temperature uses helpers: ctof(0) = 32, ftoc(32) = 0."
    ]);

    this.addSection("Obsidian LaTeX", [
      "History row copy copies an Obsidian math block: $$ ... $$.",
      "History row insert sends the equation to the last active Markdown note cursor.",
      "Academic notation uses \\frac{}, \\sqrt{}, \\sin(), \\binom{}, and \\mathrm{} for units."
    ]);
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private addSection(title: string, items: string[]): void {
    this.contentEl.createEl("h3", { text: title });
    const list = this.contentEl.createEl("ul");
    for (const item of items) list.createEl("li", { text: item });
  }
}

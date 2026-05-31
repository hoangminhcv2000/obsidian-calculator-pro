# Changelog

## 1.0.3 - 2026-05-31

Settings cleanup.

### Changed

- Removed Settings controls for angle mode, complex mode, and view mode because these are already available directly in the calculator UI.
- Kept Settings focused on exact fractions, display precision, and history preferences.

## 1.0.2 - 2026-05-31

Command palette cleanup.

### Changed

- Renamed command palette entries to `Open` and `Reset` so Obsidian displays them as `Calculator Pro: Open` and `Calculator Pro: Reset`.

## 1.0.1 - 2026-05-31

Maintenance release for Community Plugin scan cleanup.

### Changed

- Removed an extra build-only dependency by using Node's native module list.
- Removed partially supported scrollbar styling.
- Cleaned up a duplicate result text-size CSS declaration.

## 1.0.0 - 2026-05-31

Initial public release of Calculator Pro.

### Added

- Scientific calculator inside Obsidian.
- Clean responsive calculator UI with full and compact layouts.
- Equation history with per-row copy and insert actions.
- Obsidian-compatible LaTeX formatting for full equations.
- Trigonometry, powers, roots, logarithms, fractions, constants, complex numbers, statistics, units, and temperature helpers.
- Settings for angle mode, complex mode, precision, exact fractions, history, and keypad layout.
- Ribbon icon and command palette commands.

### Release

- Prepared Community Plugin metadata.
- Added README, screenshots, license, tests, CI, and release build scripts.

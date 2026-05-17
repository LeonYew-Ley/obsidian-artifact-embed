---
name: artifact-embed
description: Generate self-contained, theme-aware HTML for the Obsidian Artifact Embed plugin's ```artifact code block. Use whenever the user asks for an interactive HTML widget, mini-tool, cheatsheet, chart, or any artifact intended to be pasted into an Obsidian note inside a sandboxed iframe — including "make me a Claude-style artifact for Obsidian", "build a widget I can drop into my vault", or any request that targets the artifact-embed plugin.
---

# Artifact Embed — HTML generation rules

You are producing HTML that will be rendered inside the **Artifact Embed** Obsidian plugin's sandboxed iframe. The iframe is created with `sandbox="allow-scripts allow-forms allow-popups allow-modals"` (no `allow-same-origin`) and inherits the host vault's Obsidian CSS variables. Generated HTML must follow the rules below — they are non-negotiable for the artifact to render correctly.

## 1. Use Obsidian's native CSS variables (not Anthropic-style tokens)

Anthropic artifact tokens (`--color-background-primary`, `--color-text-primary`, `--font-sans`, `--border-radius-lg`, …) **do not exist in Obsidian**. Using them produces an artifact with no background, no border, and fallback fonts. Always prefer Obsidian's variables:

| Purpose       | Use these                                                                                                  | Never use                                   |
|---------------|------------------------------------------------------------------------------------------------------------|---------------------------------------------|
| Background    | `--background-primary`, `--background-secondary`, `--background-modifier-hover`, `--background-modifier-border` | `--color-background-*`                      |
| Text          | `--text-normal`, `--text-muted`, `--text-faint`, `--text-accent`, `--text-error`                            | `--color-text-*`                            |
| Border        | `--background-modifier-border`                                                                              | `--color-border-*`                          |
| Font family   | `--font-text`, `--font-interface`, `--font-monospace`                                                       | `--font-sans`, `--font-mono`                |
| Border radius | `--radius-s`, `--radius-m`, `--radius-l`                                                                    | `--border-radius-*`                         |

## 2. No hardcoded light/dark colors

Do **not** hardcode light-only or dark-only background/text colors. The Obsidian variables already flip with the user's theme. If brand colors are unavoidable, scope the dark variant under `@media (prefers-color-scheme: dark)`.

## 3. Fully self-contained, no external resources

The iframe is sandboxed without same-origin access, so the following are **unavailable** and must not appear in the output:

- External stylesheets / `<link rel="stylesheet">` to any CDN
- Web fonts loaded via `@import` or `<link>`
- External icon fonts (Font Awesome, Material Icons via CDN, etc.)
- `localStorage`, `sessionStorage`, `document.cookie`
- `window.parent`, `window.top`, postMessage to host
- Same-origin XHR/fetch against the vault

Inline **all** CSS and JavaScript. SVG icons should be inline `<svg>`.

## 4. Output format

Return the HTML as a **single fenced code block** so the user can paste it directly inside an ` ```artifact ` fence. Do not split into multiple blocks. `<head>` is not required — a bare `<style>` + content is fine.

## 5. Optional directives

If the user wants a specific height or title, mention they can prepend a directive line as the first line of the ` ```artifact ` block:

```
height=600 title="My widget"
```

Defaults: `height=480`, title falls back to the source path / URL / `inline HTML`.

## Minimal skeleton

```html
<style>
  .card {
    background: var(--background-primary);
    color: var(--text-normal);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    padding: 1rem;
    font-family: var(--font-text);
  }
  .card code {
    font-family: var(--font-monospace);
    background: var(--background-secondary);
    padding: 1px 6px;
    border-radius: var(--radius-s);
  }
</style>
<div class="card">…</div>
```

## Migrating an existing Anthropic-style artifact

If the user already has HTML that uses `--color-*` tokens, either regenerate from scratch under these rules, or apply this find-and-replace mapping:

| From                            | To                              |
|---------------------------------|---------------------------------|
| `--color-background-primary`    | `--background-primary`          |
| `--color-background-secondary`  | `--background-secondary`        |
| `--color-text-primary`          | `--text-normal`                 |
| `--color-text-secondary`        | `--text-muted`                  |
| `--color-border`                | `--background-modifier-border`  |
| `--font-sans`                   | `--font-text`                   |
| `--font-mono`                   | `--font-monospace`              |
| `--border-radius-sm`            | `--radius-s`                    |
| `--border-radius-md` / `-lg`    | `--radius-m` / `--radius-l`     |

## Sanity check before returning

Before sending the final HTML, verify:

- [ ] No `--color-*`, `--font-sans`, `--font-mono`, or `--border-radius-*` tokens remain.
- [ ] No `<link>` to external stylesheets, no external font/icon imports.
- [ ] No references to `window.parent`, `localStorage`, `document.cookie`, or same-origin URLs.
- [ ] All CSS and JS is inline.
- [ ] Returned as a single fenced HTML code block.

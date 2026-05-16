'use strict';

const obsidian = require('obsidian');

// ============================================================
// Defaults & constants
// ============================================================

const DEFAULT_HEIGHT = 480;
const SANDBOX_FLAGS = 'allow-scripts allow-forms allow-popups allow-modals';
// NOTE: 'allow-same-origin' is intentionally omitted — keeps the iframe
// origin-isolated so its JS can't reach window.parent, cookies, or vault.

// SVG icons (inline, no font dependency)
const ICONS = {
  refresh:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3.5-7.1"/><polyline points="21 3 21 9 15 9"/></svg>',
  external:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
  copy:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  file:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
  globe:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  code:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
};

// ============================================================
// Theme bridge — collect Obsidian CSS variables for iframe injection
// ============================================================

class ThemeBridge {
  constructor() {
    this._cachedCss = null;
  }

  invalidate() {
    this._cachedCss = null;
  }

  getCss() {
    if (this._cachedCss !== null) return this._cachedCss;
    this._cachedCss = this._build();
    return this._cachedCss;
  }

  _build() {
    const names = new Set();
    for (const sheet of Array.from(document.styleSheets)) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch (e) {
        continue; // cross-origin or restricted
      }
      if (!rules) continue;
      this._collectNamesFromRules(rules, names);
    }

    const bodyStyle = getComputedStyle(document.body);
    const decls = [];
    names.forEach((name) => {
      const value = bodyStyle.getPropertyValue(name).trim();
      if (value) decls.push(`${name}: ${value};`);
    });

    // Mirror color-scheme so iframe's default form controls / scrollbars match.
    const isDark = document.body.classList.contains('theme-dark');
    const colorScheme = isDark ? 'dark' : 'light';

    return `<style>
:root {
  color-scheme: ${colorScheme};
  ${decls.join('\n  ')}
}
html, body {
  margin: 0;
  padding: 0;
  background: var(--background-primary, transparent);
  color: var(--text-normal, inherit);
  font-family: var(--font-text, var(--font-interface, system-ui));
  font-size: var(--font-text-size, 16px);
  line-height: var(--line-height-normal, 1.5);
}
</style>`;
  }

  _collectNamesFromRules(rules, out) {
    for (const rule of Array.from(rules)) {
      if (rule.style) {
        for (let i = 0; i < rule.style.length; i++) {
          const name = rule.style[i];
          if (name && name.startsWith('--')) out.add(name);
        }
      }
      // recurse into @media / @supports
      if (rule.cssRules) this._collectNamesFromRules(rule.cssRules, out);
    }
  }
}

// ============================================================
// Directive parsing — height/title overrides
// ============================================================

const DIRECTIVE_RE = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;

function parseDirectiveString(str) {
  const out = {};
  if (!str) return out;
  let m;
  DIRECTIVE_RE.lastIndex = 0;
  while ((m = DIRECTIVE_RE.exec(str)) !== null) {
    const key = m[1].toLowerCase();
    const val = m[2] ?? m[3] ?? m[4] ?? '';
    out[key] = val;
  }
  return out;
}

// ============================================================
// Source classification
// ============================================================

function isExternalUrl(s) {
  return /^https?:\/\//i.test(s);
}

function looksLikeHtmlPath(s) {
  return /\.html?$/i.test(s);
}

// Decide whether the trimmed first line is a directive line (key=val pairs)
// rather than a path / URL / HTML.
function isDirectiveLine(line) {
  const t = line.trim();
  if (!t) return false;
  if (t.includes('<') || t.includes('>')) return false;
  if (isExternalUrl(t)) return false;
  if (looksLikeHtmlPath(t.split(/\s+/)[0])) return false;
  return /\w+\s*=/.test(t);
}

// Parse a ```artifact code block body into { directives, body }.
// Optional first line may be `key=value` directives (height, title, ...).
function parseArtifactBlock(source) {
  const firstNewline = source.indexOf('\n');
  if (firstNewline === -1) {
    return isDirectiveLine(source)
      ? { directives: parseDirectiveString(source), body: '' }
      : { directives: {}, body: source };
  }
  const firstLine = source.slice(0, firstNewline);
  const rest = source.slice(firstNewline + 1);
  if (isDirectiveLine(firstLine)) {
    return { directives: parseDirectiveString(firstLine), body: rest };
  }
  return { directives: {}, body: source };
}

// Decide the source kind from a body string.
//   - single-line URL  → { kind: 'url', url }
//   - single-line .html path (no HTML tags) → { kind: 'path', path }
//   - anything else → { kind: 'inline', html }
function classifyBody(body) {
  const trimmed = body.trim();
  if (!trimmed) return { kind: 'inline', html: '' };
  const isSingleLine = !/[\r\n]/.test(trimmed);
  if (isSingleLine && isExternalUrl(trimmed)) {
    return { kind: 'url', url: trimmed };
  }
  if (isSingleLine && !trimmed.includes('<') && looksLikeHtmlPath(trimmed)) {
    return { kind: 'path', path: trimmed };
  }
  return { kind: 'inline', html: body };
}

// ============================================================
// ArtifactCard — DOM + iframe + toolbar
// ============================================================

class ArtifactCard {
  /**
   * @param {HTMLElement} container — element to fill (replaces its contents)
   * @param {object} source — { kind: 'file'|'url'|'inline', ... }
   * @param {object} options — { height, title }
   * @param {ArtifactEmbedPlugin} plugin
   */
  constructor(container, source, options, plugin) {
    this.container = container;
    this.source = source;
    this.options = options || {};
    this.plugin = plugin;
    this._iframe = null;
    this._currentSrcdoc = '';
    this._currentUrl = '';
  }

  async render() {
    const { container } = this;
    container.empty();
    container.addClass('artifact-card');

    // ---- header ----
    const header = container.createDiv({ cls: 'artifact-header' });
    const title = header.createDiv({ cls: 'artifact-title' });
    const iconHtml =
      this.source.kind === 'url'
        ? ICONS.globe
        : this.source.kind === 'inline'
          ? ICONS.code
          : ICONS.file;
    title.createSpan({ cls: 'artifact-title-icon' }).innerHTML = iconHtml;
    title.createSpan({ text: this._titleText() });

    const actions = header.createDiv({ cls: 'artifact-actions' });
    this._addAction(actions, ICONS.refresh, 'Reload', () => this._reload());
    if (this.source.kind === 'url' || this.source.kind === 'file') {
      this._addAction(actions, ICONS.external, 'Open externally', () =>
        this._openExternally(),
      );
    }
    this._addAction(actions, ICONS.copy, 'Copy source', () => this._copySource());

    // ---- body ----
    const body = container.createDiv({ cls: 'artifact-body' });
    const iframe = body.createEl('iframe', { cls: 'artifact-iframe' });
    iframe.setAttribute('sandbox', SANDBOX_FLAGS);
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.setAttribute('loading', 'lazy');
    iframe.style.height = `${this._resolvedHeight()}px`;
    this._iframe = iframe;

    await this._load();
  }

  _addAction(parent, svg, label, handler) {
    const btn = parent.createEl('button', {
      cls: 'artifact-action-btn',
      attr: { 'aria-label': label, title: label, type: 'button' },
    });
    btn.innerHTML = svg;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handler();
    });
  }

  _titleText() {
    if (this.options.title) return this.options.title;
    if (this.source.kind === 'file') return this.source.file.path;
    if (this.source.kind === 'url') return this.source.url;
    return 'inline HTML';
  }

  _resolvedHeight() {
    const raw = this.options.height ?? DEFAULT_HEIGHT;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 40 ? n : DEFAULT_HEIGHT;
  }

  async _load() {
    try {
      if (this.source.kind === 'url') {
        this._currentUrl = this.source.url;
        this._iframe.removeAttribute('srcdoc');
        this._iframe.setAttribute('src', this.source.url);
        return;
      }

      let rawHtml = '';
      if (this.source.kind === 'file') {
        rawHtml = await this.plugin.app.vault.read(this.source.file);
      } else {
        rawHtml = this.source.html || '';
      }

      const themeCss = this.plugin.themeBridge.getCss();
      const finalHtml = injectThemeCss(rawHtml, themeCss);
      this._currentSrcdoc = finalHtml;
      this._iframe.removeAttribute('src');
      this._iframe.setAttribute('srcdoc', finalHtml);
    } catch (err) {
      this._showError(err);
    }
  }

  _showError(err) {
    const msg = err && err.message ? err.message : String(err);
    const body = this.container.querySelector('.artifact-body');
    if (body) {
      body.empty();
      body.createDiv({ cls: 'artifact-error', text: `Artifact load failed: ${msg}` });
    }
  }

  _reload() {
    if (!this._iframe) return;
    // Re-fetch (file content may have changed) and rebuild with fresh theme vars.
    this._load();
  }

  async _openExternally() {
    if (this.source.kind === 'url') {
      window.open(this.source.url, '_blank');
      return;
    }
    if (this.source.kind === 'file') {
      // Resolve to a file:// URL via the Vault adapter.
      const adapter = this.plugin.app.vault.adapter;
      if (typeof adapter.getResourcePath === 'function') {
        const url = adapter.getResourcePath(this.source.file.path);
        window.open(url, '_blank');
      } else {
        new obsidian.Notice('Cannot resolve external path for this file.');
      }
    }
  }

  async _copySource() {
    let text = '';
    if (this.source.kind === 'url') text = this.source.url;
    else if (this.source.kind === 'file')
      text = await this.plugin.app.vault.read(this.source.file);
    else text = this.source.html || '';
    try {
      await navigator.clipboard.writeText(text);
      new obsidian.Notice('Artifact source copied');
    } catch (e) {
      new obsidian.Notice('Copy failed: ' + (e.message || e));
    }
  }
}

// Inject Obsidian theme variables into an HTML document. If the HTML has a
// <head>, splice in after the opening tag; otherwise prepend.
function injectThemeCss(html, themeCss) {
  if (!html) return themeCss;
  const headMatch = /<head[^>]*>/i.exec(html);
  if (headMatch) {
    const at = headMatch.index + headMatch[0].length;
    return html.slice(0, at) + themeCss + html.slice(at);
  }
  // No <head>: wrap fragment into a full document.
  return `<!doctype html><html><head>${themeCss}</head><body>${html}</body></html>`;
}

// ============================================================
// Plugin
// ============================================================

class ArtifactEmbedPlugin extends obsidian.Plugin {
  async onload() {
    this.themeBridge = new ThemeBridge();

    // Invalidate theme cache when Obsidian's CSS changes (theme switch, snippet edits).
    this.registerEvent(
      this.app.workspace.on('css-change', () => {
        this.themeBridge.invalidate();
      }),
    );

    // Single entry point: ```artifact code block.
    // Body is classified to one of: path / url / inline HTML.
    this.registerMarkdownCodeBlockProcessor('artifact', (source, el, ctx) =>
      this._processCodeBlock(source, el, ctx),
    );
  }

  _processCodeBlock(source, el, ctx) {
    const { directives, body } = parseArtifactBlock(source);
    const classified = classifyBody(body);

    if (classified.kind === 'url') {
      new ArtifactCard(el, { kind: 'url', url: classified.url }, directives, this).render();
      return;
    }

    if (classified.kind === 'path') {
      const file = this.app.metadataCache.getFirstLinkpathDest(
        classified.path,
        ctx.sourcePath || '',
      );
      if (!(file instanceof obsidian.TFile)) {
        renderArtifactError(el, `File not found in vault: ${classified.path}`);
        return;
      }
      new ArtifactCard(el, { kind: 'file', file }, directives, this).render();
      return;
    }

    new ArtifactCard(el, { kind: 'inline', html: classified.html }, directives, this).render();
  }
}

function renderArtifactError(el, message) {
  el.empty();
  el.addClass('artifact-card');
  el.createDiv({ cls: 'artifact-error', text: message });
}

module.exports = ArtifactEmbedPlugin;

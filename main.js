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

// Prefixes of Obsidian CSS variables worth forwarding into the iframe.
// Scanning the body's computed style by prefix is far cheaper than walking
// document.styleSheets, which can have tens of thousands of rules once a
// theme + snippets + other plugins are loaded.
const THEME_VAR_PREFIXES = [
  '--background-',
  '--text-',
  '--font-',
  '--interactive-',
  '--color-',
  '--accent',
  '--link-',
  '--border-',
  '--divider-',
  '--code-',
  '--blockquote-',
  '--tag-',
  '--list-',
  '--table-',
  '--icon-',
  '--scrollbar-',
  '--input-',
  '--checkbox-',
  '--radio-',
  '--toggle-',
  '--shadow-',
  '--radius-',
  '--size-',
  '--line-height-',
  '--bold-',
  '--italic-',
  '--h1-',
  '--h2-',
  '--h3-',
  '--h4-',
  '--h5-',
  '--h6-',
];

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
    const bodyStyle = getComputedStyle(document.body);
    const decls = [];
    for (let i = 0; i < bodyStyle.length; i++) {
      const name = bodyStyle[i];
      if (!name || name.charCodeAt(0) !== 45 /* '-' */) continue;
      if (!name.startsWith('--')) continue;
      if (!this._isRelevant(name)) continue;
      const value = bodyStyle.getPropertyValue(name).trim();
      if (value) decls.push(`${name}: ${value};`);
    }

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

  _isRelevant(name) {
    for (const prefix of THEME_VAR_PREFIXES) {
      if (name.startsWith(prefix)) return true;
    }
    return false;
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
  }

  render() {
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
    iframe.style.height = `${this._resolvedHeight()}px`;
    this._iframe = iframe;

    this._load();
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
      if (!this._iframe) return;

      // Obsidian sometimes invokes the markdown processor before the el is
      // attached to the live editor DOM. Setting srcdoc on a detached iframe
      // can leave it blank until something forces a re-layout. Wait until
      // the iframe is connected before loading.
      if (!this._iframe.isConnected) {
        this._waitForConnect();
        return;
      }

      if (this.source.kind === 'url') {
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
      // Setting srcdoc always triggers a full iframe document reparse —
      // skip if the content is byte-identical.
      if (finalHtml !== this._currentSrcdoc) {
        this._currentSrcdoc = finalHtml;
        this._iframe.removeAttribute('src');
        this._iframe.setAttribute('srcdoc', finalHtml);
      }
    } catch (err) {
      this._showError(err);
    }
  }

  _waitForConnect() {
    // Cap retries at ~1s so we never spin forever if the el is discarded.
    const MAX_FRAMES = 60;
    let frames = 0;
    const tick = () => {
      if (!this._iframe) return;
      if (this._iframe.isConnected) {
        this._load();
        return;
      }
      if (++frames > MAX_FRAMES) return;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
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
    // Force re-assignment even if content matches.
    this._currentSrcdoc = '';
    this._load();
  }

  async _openExternally() {
    if (this.source.kind === 'url') {
      window.open(this.source.url, '_blank');
      return;
    }
    if (this.source.kind === 'file') {
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
// <head>, splice in after the opening tag; otherwise wrap into a full doc.
function injectThemeCss(html, themeCss) {
  if (!html) return themeCss;
  const headMatch = /<head[^>]*>/i.exec(html);
  if (headMatch) {
    const at = headMatch.index + headMatch[0].length;
    return html.slice(0, at) + themeCss + html.slice(at);
  }
  return `<!doctype html><html><head>${themeCss}</head><body>${html}</body></html>`;
}

// ============================================================
// Plugin
// ============================================================

// Lazy-loaded ensureSyntaxTree from @codemirror/language. Obsidian bundles
// CM6 internally and exposes it via require; we resolve once and cache.
let _ensureSyntaxTree = null;
let _ensureSyntaxTreeTried = false;
function getEnsureSyntaxTree() {
  if (_ensureSyntaxTreeTried) return _ensureSyntaxTree;
  _ensureSyntaxTreeTried = true;
  try {
    const mod = require('@codemirror/language');
    if (mod && typeof mod.ensureSyntaxTree === 'function') {
      _ensureSyntaxTree = mod.ensureSyntaxTree;
    }
  } catch (e) {
    // Module not exposed; nothing we can do.
  }
  return _ensureSyntaxTree;
}

class ArtifactEmbedPlugin extends obsidian.Plugin {
  async onload() {
    this.themeBridge = new ThemeBridge();

    // Invalidate theme cache when Obsidian's CSS changes.
    this.registerEvent(
      this.app.workspace.on('css-change', () => {
        this.themeBridge.invalidate();
      }),
    );

    // Workaround for a CM6 lazy-parsing quirk.
    //
    // `registerMarkdownCodeBlockProcessor` is only invoked for a block once
    // CM6's incremental syntax parser has reached the block's closing fence.
    // For tall artifact blocks that span more than the initial viewport
    // (common — these are usually full-page HTML widgets), CM6 may parse
    // only the first few lines on file-open and never reach the closing
    // fence, so the processor is never called and the iframe is never
    // rendered — until the user manually scrolls to the bottom.
    //
    // See: https://forum.obsidian.md/t/long-markdown-code-block-not-fully-loaded-in-live-preview/50647
    //
    // Fix: on file-open, force CM6 to parse the entire document via
    // `ensureSyntaxTree(state, doc.length, ...)`. CM6 then discovers the
    // closing fence, schedules the post-processor, and our render path
    // proceeds normally.
    this.registerEvent(
      this.app.workspace.on('file-open', () => this._scheduleFullParse()),
    );

    this.registerMarkdownCodeBlockProcessor('artifact', (source, el, ctx) =>
      this._processCodeBlock(source, el, ctx),
    );
  }

  _scheduleFullParse() {
    // file-open fires before the editor is mounted and the doc is loaded,
    // so we try at two delays. Each attempt short-circuits if the widget
    // is already rendered, so the second call is a near-no-op in the
    // common case.
    setTimeout(() => this._forceFullParse(), 100);
    setTimeout(() => this._forceFullParse(), 500);
  }

  _forceFullParse() {
    const view = this.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (!view || !view.editor) return;
    const cm = view.editor.cm;
    if (!cm) return;
    if (cm.state.doc.length === 0) return;
    // Already rendered — nothing to do.
    if (view.contentEl.querySelector('.cm-lang-artifact .artifact-iframe')) return;
    // No artifact block in this doc — nothing to do.
    if (!/^```artifact\b/m.test(cm.state.doc.toString())) return;

    const ensureSyntaxTree = getEnsureSyntaxTree();
    if (!ensureSyntaxTree) return;
    ensureSyntaxTree(cm.state, cm.state.doc.length, 2000);
    // Bump CM6 to re-decorate against the now-complete syntax tree.
    cm.dispatch({ selection: cm.state.selection });
  }

  _processCodeBlock(source, el, ctx) {
    // If Obsidian re-invokes the processor on the same element with an
    // identical block (cursor moving in/out of the block in Live Preview,
    // view re-paints), skip the rebuild.
    const sig = `${ctx.sourcePath || ''}::${source}`;
    if (el.dataset.artifactSig === sig && el.querySelector('.artifact-iframe')) {
      return;
    }
    el.dataset.artifactSig = sig;

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

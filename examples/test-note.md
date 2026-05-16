# Artifact Embed — Test Note

> Drop this file anywhere inside a vault that has **Artifact Embed** enabled.
> All three syntax variants should render as cards in both Reading mode and Live Preview.

---

## ① Inline HTML — interactive counter

```artifact
height=260 title="Counter"
<!doctype html>
<html>
<head>
  <style>
    body {
      display: grid;
      place-items: center;
      height: 100vh;
      margin: 0;
      font-family: var(--font-text, system-ui);
      color: var(--text-normal, #222);
      background: var(--background-primary, transparent);
    }
    .num { font-size: 56px; font-weight: 700; }
    button {
      margin-top: 12px;
      padding: 8px 22px;
      font-size: 14px;
      border-radius: 8px;
      border: 1px solid var(--background-modifier-border, #ccc);
      background: var(--interactive-accent, #5b6cff);
      color: var(--text-on-accent, white);
      cursor: pointer;
    }
    button:hover { filter: brightness(1.1); }
  </style>
</head>
<body>
  <div style="text-align: center">
    <div class="num" id="n">0</div>
    <button id="b">+1</button>
  </div>
  <script>
    let count = 0;
    document.getElementById('b').onclick = () => {
      document.getElementById('n').textContent = ++count;
    };
  </script>
</body>
</html>
```

> Should follow your Obsidian theme — switch light/dark and the number color, button, and background should all flip.

---

## ② Inline HTML — embedded SVG chart

```artifact
height=220 title="SVG sparkline"
<!doctype html>
<svg viewBox="0 0 400 160" xmlns="http://www.w3.org/2000/svg"
     style="width: 100%; height: 100%; background: var(--background-primary, transparent)">
  <polyline fill="none" stroke="var(--interactive-accent, #5b6cff)" stroke-width="2.5"
            points="10,120 60,90 110,100 160,55 210,70 260,40 310,60 360,30"/>
  <g fill="var(--interactive-accent, #5b6cff)">
    <circle cx="10"  cy="120" r="3"/>
    <circle cx="60"  cy="90"  r="3"/>
    <circle cx="110" cy="100" r="3"/>
    <circle cx="160" cy="55"  r="3"/>
    <circle cx="210" cy="70"  r="3"/>
    <circle cx="260" cy="40"  r="3"/>
    <circle cx="310" cy="60"  r="3"/>
    <circle cx="360" cy="30"  r="3"/>
  </g>
</svg>
```

---

## ③ Vault file — write the relative path

> Make sure a file actually exists at the path below in your vault before testing.

```artifact
demo/cheatsheet.html
```

---

## ④ External URL

> Many production sites refuse to be iframed (`X-Frame-Options: DENY`). `example.com` allows it.

```artifact
https://example.com/
```

---

## Verification checklist

- [ ] All four blocks render as cards with a header bar (icon + title + 🔄 🌐 📋 buttons) in **Reading mode**
- [ ] Same cards render in **Live Preview** mode; clicking into a code block reverts that one to source
- [ ] **Theme switching** (light ↔ dark): inline samples follow theme colors via `var(--text-normal)` etc.
- [ ] 🔄 **Reload** button refreshes the iframe (counter resets to 0)
- [ ] 📋 **Copy source** triggers a "Artifact source copied" notice
- [ ] 🌐 **Open externally** opens the file/URL in the system browser (only shown for file/url, not inline)
- [ ] **Sandbox holds**: in DevTools, evaluate `window.parent.app` from inside the iframe → throws `SecurityError`

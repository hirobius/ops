# MDS Asset Folder

This is a folder-level note for the legacy MDS asset bucket.

Drop your image files here. No rebuild needed — Vite serves `/public/` as static assets.
Any supported format works (`.jpg`, `.png`, `.webp`, `.avif`) — just match the filename in `projects.ts` if you change the extension.

Keep source attribution aligned with [`ATTRIBUTIONS.md`](C:\Users\Adrian\Documents\New%20project\adrian-milsap\ATTRIBUTIONS.md).

---

## Hero images  `/public/assets/mds/<file>`

One hero image per gallery item. This is the thumbnail visible in the horizontal strip.

| File | Item | Aspect |
|------|------|--------|
| `illustration-system.jpg` | Illustration System | 1:1 |
| `tokens-variables.jpg` | Tokens + Variables | 14:9 |
| `website-article-template.jpg` | Article Template | 16:9 |
| `accessibility-controls.jpg` | Accessibility Controls | 16:9 |
| `ms-game-dev-website.jpg` | Game Dev Website | 21:9 |
| `component-library.jpg` | Component Library | 4:3 |
| `visual-explorations.jpg` | Visual Explorations | 14:9 |

---

## Detail images  `/public/assets/mds/<slug>/<nn>.jpg`

Shown in the lightbox "Supporting Visuals" grid when a gallery item is clicked.
Each item has its own subfolder. Names are `01.jpg`, `02.jpg`, etc.

```
assets/mds/
├── illustration-system/
│   ├── 01.jpg   Colour system + depth rules
│   ├── 02.jpg   Metaphor library
│   ├── 03.jpg   Applied across surfaces
│   └── 04.jpg   Style guide
├── tokens-variables/
│   ├── 01.jpg   Three-tier taxonomy
│   ├── 02.jpg   GCE variable pipeline
│   └── 03.jpg   Multi-brand output
├── website-article-template/
│   ├── 01.jpg   Layout evolution
│   ├── 02.jpg   Content slot system
│   ├── 03.jpg   Mobile reading experience
│   └── 04.jpg   Accessibility spec
├── accessibility-controls/
│   ├── 01.jpg   Control panel
│   ├── 02.jpg   Contrast modes
│   └── 03.jpg   Keyboard flow
├── ms-game-dev-website/
│   ├── 01.jpg   Homepage concept
│   ├── 02.jpg   Dev tools section
│   ├── 03.jpg   Navigation system
│   └── 04.jpg   Mobile breakpoint
├── component-library/
│   ├── 01.jpg   Slot component
│   ├── 02.jpg   Web form scrub
│   ├── 03.jpg   XDS Text
│   └── 04.jpg   Game Item card
└── visual-explorations/
    ├── 01.jpg   Teaser + hero popout
    ├── 02.jpg   Banner explorations
    └── 03.jpg   Email templates
```

---

## Editing copy or dimensions

All titles, descriptions, detail captions, and `width`/`height` values live in:
`/src/app/data/projects.ts` → `mdsItems` array.

Update `width`/`height` if your real image has a significantly different aspect ratio —
these drive placeholder sizing before the file exists.

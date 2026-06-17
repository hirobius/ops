# LLM Stream Schema

The Headless UI Renderer consumes flat JSON Lines, not nested JSON. The local LLM must emit one complete JSON object per line. Each line is an atomic, append-only command that can be parsed and rendered immediately.

Nested JSON trees are intentionally avoided because partial token streams often contain incomplete braces, arrays, or child lists. JSONL lets the bridge wait only for a newline, validate one object, and forward it to Figma with minimal latency.

## Transport

- Producer: local LLM script streams UTF-8 text to `POST /generate`.
- Bridge: `scripts/llm-stream-bridge.mjs` buffers bytes until a newline, parses the complete line, then emits it over SSE.
- Consumer: the Figma plugin listens to `GET /stream` and renders each command as it arrives.

## Command Shape

```json
{"action":"ADD_NODE","id":"n1","parentId":"root","type":"FRAME","props":{"layoutMode":"VERTICAL","padding":"semantic.space.layout.tight"}}
```

Required fields:

| Field | Type | Notes |
| --- | --- | --- |
| `action` | string | Currently only `ADD_NODE`. |
| `id` | string | Stable stream-local id. Later children reference this value. |
| `parentId` | string | Parent stream id. Use `root` for the current Figma page. |
| `type` | string | `FRAME`, `TEXT`, or `INSTANCE`. |
| `props` | object | Flat props for the target node. Token values should use HDS token paths. |

Supported node types:

- `FRAME`: creates a Figma frame. Use for layout, groups, forms, panels, and rows.
- `TEXT`: creates a Figma text node. Text content and font loading are handled asynchronously.
- `INSTANCE`: creates an HDS component instance. `props.component` must map to a component in `public/hds-manifest.json`.

## Common Props

| Prop | Applies to | Example |
| --- | --- | --- |
| `name` | all | `"Login Form"` |
| `width`, `height` | `FRAME`, `INSTANCE` | `360` |
| `layoutMode` | `FRAME` | `"VERTICAL"` or `"HORIZONTAL"` |
| `gap`, `itemSpacing` | `FRAME` | `"semantic.space.component.gap"` |
| `padding`, `paddingX`, `paddingY` | `FRAME` | `"semantic.space.layout.tight"` |
| `fill`, `stroke` | `FRAME`, `TEXT` | `"semantic.color.surface.raised"` |
| `radius` | `FRAME`, `INSTANCE` | `"semantic.radius.action"` |
| `text` | `TEXT` | `"Sign in"` |
| `typography` | `TEXT` | `"semantic.typography.heading3"` |
| `component` | `INSTANCE` | `"HdsButton"` |
| `variant` | `INSTANCE` | `"primary"` |

Compatibility note: aliases such as `semantic.space.px16` are accepted by the renderer as numeric fallbacks, but generated commands should prefer actual token paths from `public/hds-manifest.json`.

## Login Form Example

```jsonl
{"action":"ADD_NODE","id":"form","parentId":"root","type":"FRAME","props":{"name":"Login Form","layoutMode":"VERTICAL","width":360,"padding":"semantic.space.component.padding","gap":"semantic.space.layout.tight","fill":"semantic.color.surface.raised","stroke":"semantic.color.border.default","radius":"primitive.radius.8"}}
{"action":"ADD_NODE","id":"title","parentId":"form","type":"TEXT","props":{"name":"Title","text":"Sign in","typography":"semantic.typography.heading3","fill":"semantic.color.content.primary"}}
{"action":"ADD_NODE","id":"email","parentId":"form","type":"INSTANCE","props":{"component":"Input","name":"Email field","label":"Email","placeholder":"you@example.com","type":"email"}}
{"action":"ADD_NODE","id":"password","parentId":"form","type":"INSTANCE","props":{"component":"Input","name":"Password field","label":"Password","placeholder":"Password","type":"password"}}
{"action":"ADD_NODE","id":"actions","parentId":"form","type":"FRAME","props":{"name":"Actions","layoutMode":"HORIZONTAL","width":"fill","gap":"semantic.space.component.gap"}}
{"action":"ADD_NODE","id":"submit","parentId":"actions","type":"INSTANCE","props":{"component":"HdsButton","name":"Submit","variant":"primary","text":"Sign in"}}
{"action":"ADD_NODE","id":"forgot","parentId":"actions","type":"INSTANCE","props":{"component":"HdsButton","name":"Forgot password","variant":"tertiary","text":"Forgot password"}}
```

Each line can render before the next one exists. The LLM should emit parents before children so the plugin can append nodes without waiting for a completed tree.

/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * figma-agent-plugin/templates.js
 * 12h-3: Layout template registry for Figma plugin template injection.
 *
 * Each template defines an id, display name, and ordered sections array.
 * Each section has a name (used as the text label) and a relative height type:
 *   - 'hero'    → 480px
 *   - 'footer'  → 120px
 *   - 'section' → 240px (default)
 *
 * Frame width is always 1440px (standard desktop design canvas).
 */

var HDS_TEMPLATES = [
  {
    id: 'home-hero',
    name: 'Home',
    sections: [
      { name: 'Hero',         height: 'hero' },
      { name: 'Features',     height: 'section' },
      { name: 'Testimonials', height: 'section' },
      { name: 'CTA',          height: 'section' },
      { name: 'Footer',       height: 'footer' }
    ]
  },
  {
    id: 'product-detail',
    name: 'Product Detail',
    sections: [
      { name: 'Hero',             height: 'hero' },
      { name: 'Product Info',     height: 'section' },
      { name: 'Gallery',          height: 'section' },
      { name: 'Related Products', height: 'section' },
      { name: 'Footer',           height: 'footer' }
    ]
  },
  {
    id: 'about',
    name: 'About',
    sections: [
      { name: 'Hero',   height: 'hero' },
      { name: 'Story',  height: 'section' },
      { name: 'Team',   height: 'section' },
      { name: 'Values', height: 'section' },
      { name: 'Footer', height: 'footer' }
    ]
  },
  {
    id: 'contact',
    name: 'Contact',
    sections: [
      { name: 'Hero',         height: 'hero' },
      { name: 'Contact Form', height: 'section' },
      { name: 'Location',     height: 'section' },
      { name: 'Footer',       height: 'footer' }
    ]
  },
  {
    id: 'digital-biz-card',
    name: 'Digital Business Card',
    sections: [
      { name: 'Profile',    height: 'hero' },
      { name: 'Services',   height: 'section' },
      { name: 'Links',      height: 'section' },
      { name: 'Footer',     height: 'footer' }
    ]
  }
];

// Height map in pixels
var TEMPLATE_HEIGHTS = {
  hero:    480,
  section: 240,
  footer:  120
};

var TEMPLATE_FRAME_WIDTH = 1440;

// Build a quick lookup by id
var TEMPLATE_MAP = {};
for (var _ti = 0; _ti < HDS_TEMPLATES.length; _ti++) {
  TEMPLATE_MAP[HDS_TEMPLATES[_ti].id] = HDS_TEMPLATES[_ti];
}

// CommonJS-style export so this can be required() from scripts if ever needed.
// In the Figma plugin sandbox, this file is served as static source via
// /plugin-source/templates.js and executed via indirect eval — the globals
// land on globalThis.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { HDS_TEMPLATES: HDS_TEMPLATES, TEMPLATE_MAP: TEMPLATE_MAP, TEMPLATE_HEIGHTS: TEMPLATE_HEIGHTS, TEMPLATE_FRAME_WIDTH: TEMPLATE_FRAME_WIDTH };
}
if (typeof globalThis !== 'undefined') {
  globalThis.HDS_TEMPLATES = HDS_TEMPLATES;
  globalThis.TEMPLATE_MAP = TEMPLATE_MAP;
  globalThis.TEMPLATE_HEIGHTS = TEMPLATE_HEIGHTS;
  globalThis.TEMPLATE_FRAME_WIDTH = TEMPLATE_FRAME_WIDTH;
}

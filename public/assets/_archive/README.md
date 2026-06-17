Archive folder for replaced or retired site assets.

Workflow:
- Keep current live assets in their project folders under `public/assets/`
- When replacing a live asset, move the old file here instead of deleting it
- Prefer a structure like:
  - `public/assets/_archive/<project>/<slot-id>/`
- Example:
  - `public/assets/_archive/mds/hero-01/2026-04-09-hero-01.png`

This keeps the live asset paths clean while preserving visual history without needing to dig through Git.

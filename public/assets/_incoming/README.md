Drop new site assets here for intake.

Recommended workflow:
- Put raw exports or candidate web assets in this folder.
- Name them loosely if you want, or use the destination slot id directly.
- Convert them with `pnpm assets:convert` before slotting if they should become WebP.
- Tell Codex which slot they belong to, for example:
  - `put this in hero-01 on /microsoft-design-systems`
  - `map these to asset-07 through asset-10 on /visuals`
  - `swap asset-03 and asset-04 on /visuals`
- Codex will:
  - move the file into its permanent folder under `public/assets/`
  - rename it if needed
  - wire the slot to the uploaded file or project registry entry
  - move any replaced live asset into `public/assets/_archive/`

Conversion helper:
- `pnpm assets:convert`
- `pnpm assets:convert --dry-run`
- `pnpm assets:convert hero-01.png`
- `pnpm assets:convert --keep-png hero-01.png`

The converter writes `.webp` files next to the originals in `_incoming` so you can inspect them before slotting. Use `--keep-png` whenever an asset needs to remain PNG.
If you just installed FFmpeg for the first time, restart your terminal before running the converter so the new `ffmpeg` command is available on your PATH.

Current slot behavior:
- Public pages hide assigned slot badges by default.
- Draft mode is available with `?slots=show`.
- Empty slots still show their slot id visibly.

Preferred formats:
- `webp` for most final web images
- `png` for transparency or crisp graphic exports
- `jpg` only if already optimized

This folder is only a staging area. Final mapped assets should be moved into the project-specific folders under `public/assets/`.

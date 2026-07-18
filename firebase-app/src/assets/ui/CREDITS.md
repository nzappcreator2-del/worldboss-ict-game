# UI/Icon Credits

These are painted-style RPG icons/frames, cleaned and cropped from source
sheets under `2D/` (not checked into git; kept locally for regenerating
these if needed). None of the source sheets have real alpha transparency —
they bake a checkerboard background into the pixels — so every crop here
went through `scripts/slice-ui-sheet.mjs`'s `matteCheckerboard()` (flood-fill
removal from the crop border) before being resized and saved.

| Local file(s) | Source |
|---|---|
| `item-*.png`, `chest-*.png` | `2D/item-drop/item1.png` — "RPG Item Drop Assets, 50 Unique Icons" |
| `badge-*.png`, `icon-fireball.png`, `ui-btn-sword-round.png`, `ui-corner-gold.png`, `ui-minimap-frame.png`, `ui-ornate-frame.png`, `ui-panel-parchment.png` | `2D/UI/1.png` — "Epic Fantasy RPG UI Asset Pack" |
| `icon-star.png`, `icon-flame.png`, `icon-book.png` | `2D/Free - Raven Fantasy Icons/` — Raven Fantasy Icons by Clockwork Raven Studios (clockworkravenstudios, patreon.com/clockworkravenstudios) |

`cos-*.png` are earlier exploratory crops that ended up unused (the shop's
cosmetic icons come from `src/assets/character/icons/` instead) — left in
place rather than deleted, matching this folder's existing convention of not
pruning unreferenced-but-harmless assets.

`pvp/*.png` are cropped from a reference PVP arena UI mockup provided
directly by the project owner (not from `2D/`); source kept at
`D:\Nzdev\GameProject\game-project\next-gen-play\ref-nexgenplay\pvp\`. The
sheet is a JPEG with a baked checkerboard (no real alpha), so it went through
the same `matteCheckerboard()` + manual seam-splitting as the `2D/` sheets
before being saved — see `src/components/PvpMode.tsx` for how each piece is
wired into the mode-select screen. NOTE: the two glowing mode-select card
frames were originally cut from this sheet too (`frame-duel.png`/`frame-team.png`)
but the crop was too fragile (wavy glowing edges), so they were replaced by
the `ModeCardArt` inline-SVG component in `PvpMode.tsx` (drawn from scratch,
resolution-independent) and the PNGs deleted. `../pvp-select-background.jpg` (castle
gate scene with "PVP ARENA" baked into the art) is from the same reference
folder and is used as-is (no cropping needed).

See `src/components/lessonUiAssets.ts` and `src/components/DashboardShell.tsx`
for how each icon is wired to a UI slot.

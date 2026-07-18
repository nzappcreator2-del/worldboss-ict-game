# Loading Screen Credits

| Local file(s) | Source |
|---|---|
| `knight-run.png` | `2D/Tiny RPG Character Asset Pack 01 v2.0 -Free Soldier&Orc/Characters(100x100 split)/Soldier/Soldier with shadows/Soldier_Walk.png` — "Tiny RPG Character Asset Pack 01 v2.0 - Free Soldier & Orc" |

Unlike the `2D/UI`, `2D/item-drop`, and `2D/treasure chest` sheets documented in
`src/assets/ui/CREDITS.md`, this sprite sheet ships with real alpha
transparency (no baked checkerboard), so it was copied as-is with no
cropping/matting step. It is an 8-frame walk cycle, 100x100px per frame
(800x100px total), used by `src/components/LoadingScreen.tsx` as the running
knight that tracks the boot-time resource preload progress.

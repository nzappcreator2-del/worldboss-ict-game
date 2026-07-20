# Character Sprite Credits (LPC Paper-Doll Layers)

The layered character spritesheets in this folder are composed from the
**Universal LPC Spritesheet Character Generator** collection:

- Generator/collection: https://github.com/sanderfrenken/Universal-LPC-Spritesheet-Character-Generator
- Original art: Liberated Pixel Cup (LPC) contributors — see the per-sheet
  credit lists in the generator repository (`CREDITS.csv` and
  `sheet_definitions/*.json`) for the full author attribution of every item.

**Licenses:** CC-BY-SA 3.0 (http://creativecommons.org/licenses/by-sa/3.0/) and
GNU GPL 3.0 (http://www.gnu.org/licenses/gpl-3.0.html), per the LPC dual-license
terms. Redistribution of this game must keep this attribution.

Each local file below was composed (walk + attack frames re-laid onto this
project's sprite grid) from the listed source sheet in that repository.
The student-male/student-female sheets are rebuilt from an LPC generator
export with `node scripts/compose-character-sheet.mjs <standard-dir> <out.png>`:

| Local layer | Source sheet |
|---|---|
| base-hero.png | body/bodies/female/light.png + head/heads/human/female/light.png + legs/pants/female/navy.png + feet/boots/female/brown.png |
| student-male.png | body/bodies/teen/light.png + head/heads/human/male/light.png + hair/idol/adult/black.png + torso/clothes/shortsleeve/tshirt_buttoned/teen/white.png + legs/shorts/shorts/thin/brown.png (short-sleeve revision, replaces the earlier long-sleeve male/formal sheet so shop tshirts no longer clip past the baked cuff) |
| student-female.png | body/bodies/female/light.png + head/heads/human/male/light.png + hair/bob_side_part/adult/black.png + torso/clothes/shortsleeve/tshirt_buttoned/female/white.png + legs/shorts/shorts/thin/navy.png (short-sleeve revision, replaces the earlier long-skirt sheet) |
| hair-bangs.png | hair/bangs/female/blonde.png |
| hair-ponytail.png | hair/ponytail/female/black.png |
| hair-bob.png | hair/bob/adult/chestnut.png |
| hair-curly.png | hair/curly_long/female/carrot.png |
| hair-xlong.png | hair/xlong/female/blue.png |
| outfit-tshirt.png | torso/clothes/shortsleeve/tshirt/female/white.png |
| outfit-longsleeve.png | torso/clothes/longsleeve/longsleeve/female/blue.png |
| outfit-tunic.png | torso/clothes/tunic/female/forest.png |
| outfit-chainmail.png | torso/chainmail/female/gray.png |
| outfit-plate.png | torso/armour/plate/female.png |
| hat-bandana.png | hat/cloth/bandana/adult/red.png |
| hat-feather.png | hat/cloth/feather_cap/adult/green.png |
| hat-wizard.png | hat/magic/wizard/base/adult/blue.png |
| hat-crown.png | hat/formal/crown/adult/gold.png |
| hat-helmet.png | hat/helmet/norman/adult/steel.png |
| weapon-dagger.png | weapon/sword/dagger/dagger.png |
| weapon-saber.png | weapon/sword/saber/saber.png |
| weapon-longsword.png | weapon/sword/longsword/longsword.png |
| weapon-mace.png | weapon/blunt/mace/mace.png |
| weapon-waraxe.png | weapon/blunt/waraxe/waraxe.png |
| acc-scarf.png | neck/scarf/red.png |
| acc-cravat.png | neck/cravat/female.png |
| acc-necklace.png | neck/necklace/female/gold.png |
| acc-gemnecklace.png | neck/gem/round/female.png |
| acc-plumage.png | hat/accessory/plumage/adult/red.png |

Icons in `icons/` are 96px crops of the walk-down frame of the same sheets.

## Tier recolors (hat/weapon/accessory `*-<tier>.png`)

The 30 `hat-*-<tier>`, `weapon-*-<tier>` (+ their `-bg` behind-slices), and
`acc-*-<tier>` files are **not** separate LPC source art — they're generated
from the 15 hand-authored base files above by
`node scripts/recolor-cosmetic.mjs`, which applies an HSL hue/saturation/
lightness remap (bronze/iron/silver/gold/sapphire/emerald/ruby/amethyst/
obsidian/radiant — see `TIER_PALETTE` in that script) while preserving each
sprite's original shading. Re-run that script any time a base hat/weapon/
accessory layer changes to regenerate its tier variants. The tier
id/name/price table is hand-mirrored in `src/services/gameLogic.ts`
(`COSMETIC_CATALOG`) since that file ships to the browser and can't import a
Node-only script.

## teacher-weeraphat-sheet.png

Not an LPC asset: composed by `scripts/build-teacher-npc-sheet.mjs` from the
project-owned ครูวีรภัทร์ animation sheets in `2D/ตัวละคร/ครู/ครูชาย/`
(npc_teacher_weeraphat_*_8f.png). 8 columns x 6 rows (idle, wave, offer,
talk, celebrate, read), frames re-registered on the feet centroid with a
shared baseline. Rerun the script whenever the source art changes.

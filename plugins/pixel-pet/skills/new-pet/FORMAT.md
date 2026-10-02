# Pet format

A pet is one JSON object. The `preview_pet` and `set_pet` tools take it as `pet`, and a pet file holds the same object. Only `sprite` is required. The mod draws whatever else it gets, repairs what it can, and returns notes on what it did (see [Notes](#notes)). Unknown fields are ignored.

Two example pets ship with the plugin: [`assets/slime.json`](../../assets/slime.json) faces the viewer, and [`assets/duck.json`](../../assets/duck.json) faces left, beak first.

| Field | Required | What it is |
| --- | --- | --- |
| `sprite` | yes | Rows of text, one character per pixel. `.` is a clear pixel, and `*`, `+`, and `@` draw clear too. The bottom row is where the pet stands. |
| `palette` | | Maps each sprite character to a color, `"#rrggbb"` or `"#rgb"`. A character without a color draws clear. The mod keeps `*`, `+`, and `@` for its own drawings. |
| `eyes` | | Two `[x, y]` points: the top-left pixel of each eye's 2×2 pupil. `x` counts from the left and `y` from the top, both from 0. Without `eyes` the pet has no eyes and shows no faces. |
| `name` | | 1 to 24 characters. Default `"pet"`. |
| `scale` | | Default 1, where one sprite pixel is one screen pixel. A sprite too big for the scale draws at the largest scale that fits. |
| `outline` | | The palette character of the outline. It counts extra when the pet squashes, so the outline stays unbroken. |
| `eyeColor` | | The pupils' color. Default `"#000000"`. It recolors the pupils only: eye whites, stars, and hearts keep their own colors. |
| `cheeks` | | Two `[x, y]` pixels, one per cheek. |
| `cheekColor` | | The cheeks' color. Default `"#ff8aaa"`. |
| `mini` | | `{ "top", "body", "edge" }`: the three colors of the drop-shaped mini each running subagent gets. Default the slime's blues: `#9ad2ff`, `#3d84f0`, `#1e3a8a`. |

## Size

The pet draws on a 19×20 pixel canvas, and every pose has to fit it. The largest sprite per scale:

| `scale` | Largest sprite |
| --- | --- |
| 1 | 15×10 |
| 0.9 | 16×12 |
| 0.8 | 19×15 |

A bigger sprite still draws: the mod lowers the scale until it fits. At a scale under 1 the sprite is resampled smaller and loses detail, so a design that fits 15×10 keeps its pixels sharp at scale 1.

## Eyes

Each expression draws an eye in a 3×3 box, over the sprite. A clear pixel in the box shows the sprite beneath. The box's top-left is one pixel above the pupil's top-left. For `"eyes": [[3, 4], [9, 4]]`, the left eye's box covers `x` 3 to 5 and `y` 3 to 5:

```text
x  0123456789...
y3 ...###.......   # is the box
y4 ...PP#.......   P is the pupil the open eye draws
y5 ...PP#.......
```

Eyes read best on a flat patch of one body color with no outline in it. Boxes that overlap merge the wide eyes and the hearts into one shape. Put the pupils 4 pixels apart, for one clear column between the boxes. The duck's eyes, `[[3, 3], [7, 3]]`, do this:

```text
x  0123456789
y2 ...###.###   two boxes, one clear column between them
y3 ...PP#.PP#
y4 ...PP#.PP#
```

The hearts and stars fill the whole box, so a cheek right next to a box touches them. Cheeks read best a pixel below or beside the boxes, on body color.

## How the pet moves

The mod makes every motion and face from the one sprite. It stretches and squashes the sprite to stand, run, jump, think, and cheer, and lifts it up to 9 pixels for a jump. The preview shows each motion under the mode that plays it, such as `edit` while Claude writes a file. A compact shape with a wide, flat bottom reads best.

A squash shrinks the sprite by up to a third, so a feature one pixel thin can vanish in it. A beak, ears, or a tail that is at least 2 pixels thick survives every pose. The duck's beak is 2 rows tall and survives; its 1-pixel tail flickers.

Other drawings share the canvas:

- A book, a terminal, or an editor appears to the pet's right while it works. It starts at column 17 of the 19-column canvas, so it covers the two rightmost columns.
- A question mark and a thought trail appear near the top right while it thinks, and `zzz` while it sleeps.
- Sparkles appear on both sides while it cheers.
- Sweat and dizzy marks appear at the right, around rows 12 to 14.

Keep important features off the sprite's right edge, where these drawings land. The duck faces left, so its tail takes that edge.

## Colors

The terminal may be dark or light, so mid tones work on both. A dark outline reads on both. A dark pet needs a light `eyeColor`. The preview's light-terminal button shows the pet on a light background.

## Notes

The tools return a note for each repair. Each row is a repair and its cause.

| Repair | Cause |
| --- | --- |
| Rows padded with `.` | Rows of different widths. |
| `*`, `+`, `@` drawn clear | The sprite uses one of the mod's own characters. |
| A character drawn clear | It has no palette color, or its color is not `#rrggbb` or `#rgb`. |
| Scale lowered | The sprite is too big for the scale. |
| No eyes and no faces | `eyes` is not two `[x, y]` points. |
| No cheeks | `cheeks` is not two `[x, y]` pixels. |
| The slime's blue minis | `mini` lacks one of `top`, `body`, `edge`. |
| Eye box partly off the sprite | A pupil's 3×3 box extends past the sprite's edge. |
| Eye boxes merge | Pupils less than 3 pixels apart across and down. |
| Cheek inside an eye box | Some faces draw over the cheek. |

The mod ignores two things without a note: a palette entry for `.`, `*`, `+`, or `@`, and an `outline` character that is not in `palette`.

---
name: pixel-pet
description: Set up, draw, change, or recolor the pixel pet (mascot) shown above the prompt. Use when the user wants a new pet or mascot, wants the slime recolored or edited, wants to load or share a pet file, or wants the slime back.
---

# Pixel pet

Draw one still sprite with the user, preview it, revise until they approve, then put it on screen. Read [FORMAT.md](FORMAT.md) before you draw.

Two tools do the work. Their full names end in `__preview_pet` and `__set_pet`; from the marketplace they are `mcp__pixel-pet__preview_pet` and `mcp__pixel-pet__set_pet`. When they are not listed, follow [Troubleshooting](#troubleshooting) and stop.

- `preview_pet` takes `pet` and `path`, and writes an HTML page of every motion and face. The pet on screen stays as it is.
- `set_pet` takes `pet`, or `null` for the slime. It shows the pet above the prompt and keeps it for later sessions.

The mod makes every motion and face from the one sprite, plus the props and minis. Draw the sprite only, and check the preview for the rest.

Everything below is a default that makes a good mascot. The user's idea wins: a pet with no eyes, a tall thin one, a wild palette. The tools draw nearly anything and return notes on what they repaired.

## 1. Find out what they want

When the request settles the path, go to step 2. Otherwise ask one question:

> Recolor the slime, a new pet (describe it), load a pet file (give the path), or the slime back?

When they ask for a new pet without a description, ask what it is and its main color, in that one question.

## 2. Make the pet

**Recolor the slime.** Read [`assets/slime.json`](../../assets/slime.json). Keep its `sprite`, `eyes`, `cheeks`, and `outline`. Replace each `palette` color with one of the new hue, in the same order from light (`h`) to dark (`a`). Recolor `mini` to match. When the new hue is near pink, change `cheekColor` so the cheeks show.

**A new pet.** Draw from the description. Do not ask about size or format.

1. Pick a palette ramp lit from the top left: outline (darkest), shadow, base, light, highlight, plus one color per feature, such as a beak.
2. Draw the silhouette within the scale-1 size in [FORMAT.md](FORMAT.md#size). Make it compact with a wide flat bottom row. The pet may face the viewer or one side.
3. Spend pixels on what makes the pet itself: ears, a beak, a tail. Make each at least 2 pixels thick, so a squash keeps it ([why](FORMAT.md#how-the-pet-moves)).
4. Leave a flat patch of base color for each eye and set `eyes`, using the box geometry in [FORMAT.md](FORMAT.md#eyes).
5. Add `cheeks` a pixel below or beside the eye boxes when they suit the pet.
6. Set `mini` from the pet's light, base, and outline colors.

Example, a front-facing cat ([`assets/duck.json`](../../assets/duck.json) is a side-facing one):

```json
{
  "name": "cat",
  "sprite": [
    ".aa.......aa.",
    ".apa.....apa.",
    ".aoaaaaaaaoa.",
    "aoooooooooooa",
    "aoooooooooooa",
    "aoooooooooooa",
    "aoooooooooooa",
    "aoooollpllooa",
    "asssssssssssa",
    ".aaaaaaaaaaa."
  ],
  "palette": { "a": "#4a2f1d", "o": "#f0903c", "s": "#c8681f", "l": "#ffc27a", "p": "#ff7a90" },
  "outline": "a",
  "eyes": [[3, 5], [7, 5]],
  "cheeks": [[2, 7], [10, 7]],
  "mini": { "top": "#ffc27a", "body": "#f0903c", "edge": "#4a2f1d" }
}
```

**Load a pet file.** Read the file and use its object as `pet`.

**The slime back.** Call `set_pet` with `pet` set to `null`. Tell the user the slime is back. Stop.

## 3. Preview it

Call `preview_pet` with `pet` and an absolute `path` in the temp folder, such as `/tmp/cat.pet.html`.

- A pet with no sprite is refused. Add a sprite and call again.
- Any other pet draws. The result lists the clips and faces made, the resting frame (`@` is a pupil, `*` a cheek), and notes.
- Read the resting frame. The pupils sit where the face should be, each feature reads, and no pixel strays.
- Read the notes against [FORMAT.md](FORMAT.md#notes). Fix a note that names something the user did not mean, such as a color drawn clear. Leave the rest as drawn.

Open the page: `open <path>` on macOS, `xdg-open <path>` on Linux, `start <path>` on Windows. Tell the user it shows every motion, face, and frame, and that its button shows the pet on a light terminal. Ask them to approve the pet or say what to change.

## 4. Revise

Apply each request, such as bigger ears or a darker color, to the sprite or palette. Call `preview_pet` again with the same `path`, and ask them to reload the page. Change only what they asked for. Redraw from scratch only when they ask.

## 5. Put it on screen

On approval, call `set_pet` with the approved `pet`. Offer to save it as `<name>.pet.json` in the current directory, for sharing. Tell the user to ask for the slime back to undo.

## Troubleshooting

| What happens | Why, and what to tell the user |
| --- | --- |
| The tools are not listed | pixel-pet is not installed, or the session started before it loaded. Install it with `claude plugin install pixel-pet@pixel-pet`, then start a new session. After `/reload-plugins`, the tools appear from the next prompt on. |
| The tools are still missing after an install | Claude Code is older than v2.1.287, which mods need. Check with `claude --version` and update Claude Code. |
| An update changed nothing | An installed copy updates only when the plugin's version changes. Run `claude plugin marketplace update pixel-pet`, then `claude plugin update pixel-pet@pixel-pet`, and start a new session. |
| The pet does not show | The VS Code chat panel, `claude -p`, and cloud sessions do not draw it. It shows in a terminal and in the Desktop app's Code tab. |
| A toast says "your pet no longer reads", and the slime is back | The kept pet has no sprite left. Load the user's pet file again, or draw it again. |
| The preview page does not open | Give the user the path to open in a browser. |

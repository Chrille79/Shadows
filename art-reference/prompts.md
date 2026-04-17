# Låsta prompter

Copy-paste-vänliga prompter. Senast uppdaterad 2026-04-16.

För full kontext (varför dessa prompter, vilken stil vi siktar på,
vilka alternativ som avfärdats), se [../ART_PIPELINE.md](../ART_PIPELINE.md).

## ComfyUI-inställningar (samma för alla prompter)

- Checkpoint: `sd_xl_base_1.0.safetensors`
- Empty Latent Image: 1024 × 1024
- KSampler: steps **25**, cfg **7**, sampler `euler`, scheduler `normal`
- Seed: randomize mellan körningar (hit-rate ~50% på base SDXL → räkna
  med 2-3 försök per bild)

---

## Negative prompt (delas av alla)

```
people, character, portrait, face, human, figure, photorealistic, photograph, realistic texture, noisy, cluttered, bright daylight, sunny, cheerful, vibrant rainbow colors, neon environment, glowing scenery, cyan dominant, saturated, anime, manga, cel shading, hard cel shadow, thick black outlines, ink lines, flat cartoon, children's book, storybook, supercell chibi characters, cartoon mascot, cute, kawaii, chibi, low quality, blurry, watermark, text, signature, pixel art, deformed, distorted
```

---

## Prompt 1 — Djungel (primär stil-prompt)

Din lush-biom-baseline. Generera varianter av denna med olika seeds.

```
dense dark alien jungle at night, hanging vines and giant fronds, painted silhouettes in foreground, parallax layered depth with distant moonlit haze, stylized painted 2D game art in the style of Hollow Knight and Ori and the Blind Forest, digital painted silhouettes with subtle rim lighting, chunky exaggerated organic shapes, hand-painted textures, volumetric silhouette forms, dark desaturated blue-gray ambient palette, single magenta glow from bioluminescent foreground plants as gameplay light accents, atmospheric fog, 2D platformer background art, no people, empty scene, horizontal composition
```

---

## Prompt 2 — Grotta / underjorden

```
vast dark underground cavern, hanging stone stalactites in silhouette, rocky outcrops and boulders as foreground silhouettes, distant shaft of pale moonlight piercing through a cracked ceiling opening, parallax layered depth with distant foggy haze, stylized painted 2D game art in the style of Hollow Knight and Ori and the Blind Forest, digital painted silhouettes with subtle rim lighting, chunky exaggerated rock formations, hand-painted textures, volumetric silhouette forms, dark desaturated blue-gray ambient palette, single magenta glow from bioluminescent foreground crystals and fungi as gameplay light accents, atmospheric fog, 2D platformer background art, no people, empty scene, horizontal composition
```

---

## Prompt 3 — Minimalist tre-tons-palett

För karga/kristall-biom. Pure black förgrund, grå mellangrund, pale
ambient tint i bakgrund från ljus-källor.

```
vast underground cavern with tall thin rock spires, strict three-tone palette, pure black silhouette foreground with no interior detail, dark gray stone formations in middle distance, pale magenta-lavender atmospheric haze in background, heavy silhouette hierarchy, graphic minimalist composition, painted with restrained color, stylized 2D platformer game art in the style of Hollow Knight and Gris and Inside, atmospheric gradient from dark silhouette to pale ambient light, magenta crystal light sources tinting only the distant air, 2D game background art, no people, empty scene, horizontal composition
```

---

## Variant-biom (byt bara subject-delen i djungel-prompten)

Behåll allt från `painted silhouettes in foreground,...` och framåt i
djungel-prompten. Byt bara inledningen:

### Dead/blighted forest
```
dead blighted forest at night, withered dry trees with gnarled bare branches, cold and sickly atmosphere, no bioluminescent plants, painted silhouettes in foreground, parallax layered depth with distant moonlit haze, stylized painted 2D game art in the style of Hollow Knight and Ori and the Blind Forest, digital painted silhouettes with subtle rim lighting, chunky exaggerated organic shapes, hand-painted textures, volumetric silhouette forms, dark desaturated blue-gray ambient palette, atmospheric fog, 2D platformer background art, no people, empty scene, horizontal composition
```

### Swamp / wetlands
```
dark murky swamp with twisted mangrove roots, shallow reflective water, mist hugging the water surface, painted silhouettes in foreground, parallax layered depth with distant moonlit haze, stylized painted 2D game art in the style of Hollow Knight and Ori and the Blind Forest, digital painted silhouettes with subtle rim lighting, chunky exaggerated organic shapes, hand-painted textures, volumetric silhouette forms, dark desaturated blue-gray ambient palette, single magenta glow from bioluminescent foreground plants as gameplay light accents, atmospheric fog, 2D platformer background art, no people, empty scene, horizontal composition
```

### Deep canopy (tight och mörk)
```
dense jungle canopy so thick almost no moonlight reaches the floor, hanging vines, extreme darkness, painted silhouettes in foreground, parallax layered depth with distant foggy haze, stylized painted 2D game art in the style of Hollow Knight and Ori and the Blind Forest, digital painted silhouettes with subtle rim lighting, chunky exaggerated organic shapes, hand-painted textures, volumetric silhouette forms, dark desaturated blue-gray ambient palette, single magenta glow from bioluminescent foreground plants as gameplay light accents,2D platformer background art, no people, empty scene, horizontal composition
```

### Jungle ruins (nature reclaiming architecture)
```
dense dark alien jungle at night with ancient stone ruins partially buried in vines and roots, crumbling carved stone half-reclaimed by nature, painted silhouettes in foreground, parallax layered depth with distant moonlit haze, stylized painted 2D game art in the style of Hollow Knight and Ori and the Blind Forest, digital painted silhouettes with subtle rim lighting, chunky exaggerated organic shapes, hand-painted textures, volumetric silhouette forms, dark desaturated blue-gray ambient palette, single magenta glow from bioluminescent foreground plants as gameplay light accents, atmospheric fog, 2D platformer background art, no people, empty scene, horizontal composition
```

### Starfield night (vyer med stjärnhimmel + bokeh)

Inspirerad av Shakker-referens
[inspiration/external/](./inspiration/external/README.md) — silhuett-
förgrund under vast starfield med bokeh-partiklar och warm rim light.
Används för kontemplativa / översikt-vyer.

```
peaceful dark alien wilderness at night, vast starfield sky with scattered bokeh light particles floating in the atmosphere, warm golden rim light underneath foreground moss covered ridge, fireflies drifting, painted silhouettes in foreground, parallax layered depth with deep blue-black night sky, stylized painted 2D game art in the style of Hollow Knight and Ori and the Blind Forest, digital painted silhouettes with subtle rim lighting, chunky exaggerated organic shapes, hand-painted textures, volumetric silhouette forms, dark desaturated blue-gray ambient palette, single magenta glow from bioluminescent foreground plants, atmospheric fog, 2D platformer background art, no people, empty scene, horizontal composition
```

**Negative-tillägg** (för att inte dras mot Shakker-referensens line-art):
```
anime line art, glowing outline character, white line drawing, sketch style
```

---

## Iterations-tips

- **Hit-rate:** ~50% på base SDXL. Räkna med 2-3 seeds per motiv.
- **Drift-mönster att känna igen:**
  - Magenta bleeder in i hela miljön istället för att vara pickup-accent
    → kasta bilden, ny seed
  - Bilden blir för "neon jungle" / Avatar-pastisch → kasta
  - Cartoon mascot / Supercell-chibi dyker upp → kasta
- **Om en prompt aldrig träffar rätt efter 5 försök:** prompten behöver
  justeras, inte fler seeds. Justera och starta om.
- **Spara hits direkt** till `fas1-keepers/` (eller senare till
  `fas2-training-set/`) så du inte tappar dem i `output/`-röran.

## Workflow för att återfå exakt prompt/seed från en sparad bild

1. Öppna ComfyUI
2. Dra PNG-filen från `fas1-keepers/` rakt på canvasen
3. Hela workflown inklusive prompt, seed och alla inställningar
   rekonstrueras (ComfyUI sparar metadata i PNG:n)

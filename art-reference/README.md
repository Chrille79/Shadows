# art-reference

Arbetsreferenser för AI-assetpipelinen. **Inte** spel-assets — de hör
hemma under `client/src/assets/`. Det här är källmaterial för stil-lås
och LoRA-träning.

## Struktur

- `fas1-keepers/` — 4 stil-spikade bilder från Fas 1 (2026-04-16). Dessa
  är facit för stilen och input till LoRA-träning i Fas 3. Flytta hit
  från `ComfyUI/output/` när du hittar dem.
- `inspiration/external/` — referens-bilder från andra källor (Civitai,
  Shakker, Pinterest etc.) som inspirerat stil eller element. Inte egen
  output och inte LoRA-träningsdata.
- `workflows/` — exporterade ComfyUI workflow-JSONs. Exportera från
  ComfyUI via `Workflow → Save (API Format)` eller `Save` för lokal
  arbetskopia. Drag-droppa tillbaka på canvasen för att återfå exakt
  setup.
- `prompts.md` — låsta prompter i copy-paste-vänligt format.
- `lora-hunt.md` — sök-strategi + nedladdade LoRAs med konfig.

## Versionering

Committa eller inte? Trade-off:

- **Commita:** historik över stil-evolution, reproducerbart över maskiner,
  backup. Filstorleken är hanterlig (4-20 PNG:er).
- **Committa inte:** AI-generated content licensing, repo-storlek om
  setet växer, prompter i `ART_PIPELINE.md` räcker för att regenerera.

Nuvarande default: committa. Lägg till `art-reference/` i `.gitignore`
om du ångrar dig senare.

## Se också

- [../ART_PIPELINE.md](../ART_PIPELINE.md) — full plan, biom-lista,
  tekniker, checklistor
- `./prompts.md` — dedikerade copy-paste-prompts
- `./lora-hunt.md` — sök-strategi + söktermer för LoRAs på Civitai

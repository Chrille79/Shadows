# Externa referenser

Bilder från andra källor (Civitai, Shakker, Pinterest, ArtStation etc.)
som inspirerat riktning eller specifika element. **Inte** egen output
och **inte** träningsdata för LoRA — bara visuella pekare.

## Konvention

Namnge filerna med källa:
- `shakker-healing-light-01.png`
- `civitai-atmospheric-gothic-02.png`
- `artstation-<artist>-01.jpg`

## Syfte

När vi diskuterar stil eller specifika element kan vi peka på en
konkret bild istället för att beskriva med ord. Sparar oss upprepade
prompt-kalibreringar.

## Spårade referenser

### Shakker "Healing Light" LoRA-exempel (2026-04-16)

Två bilder vi tittade på men kunde inte ladda ner LoRAn (fel base
model — RelianceXL, inte SDXL 1.0).

**01 - starfield med silhuett-figur:**
- Blå palett, bokeh-stjärnor, warm rim light underifrån
- ~80% matchar vår låsta stil, saknar bara atmosphere-elementen
- → Starfield-prompt tillagd i [../../prompts.md](../../prompts.md)

**02 - glowing line-art karaktär:**
- Spelarkaraktär renderad som glödande outline mot painted bakgrund
- **Kandidat-idé för spelarkaraktärens rendering** (mörk värld, ljus
  spelare = "du bär ljuset" bokstavligen)
- → Sparad för Fas 5+ (karaktärsdesign), inte relevant för nuvarande
  tile-pipeline

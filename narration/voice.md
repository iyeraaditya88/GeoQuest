# The narrator's voice

GeoQuest's wars, battles and voyages are narrated like a calm audio tour: a warm guide at your
shoulder, never a lecturer. These scripts are recorded once (see `scripts/narrate.mts`) and play
while the map tells the same story.

## Tone
- Warm, unhurried, a little hushed. Short sentences; room to breathe between them.
- Present tense for the moment ("German tanks roll across the border"), so you're there.
- Second person sparingly, to place you ("Picture…", "You'd see…"), at most once per clip.
- One vivid, sensory detail per clip (rain, cold, the sea falling away), never an invented fact.
- End softly: a closing line that lands the moment, not a cliffhanger or a moral.

## Facts
- Facts come from the app's own data (`src/lib/worldWars.ts`, `src/data/battles/*.ts`,
  `src/lib/voyages*.ts`), or are well-established and uncontested (a date, a place, who fought).
  Nothing invented, nothing disputed stated as settled.
- Death tolls are stated plainly and gently, never dramatised.
- Numbers as digits ("338,000"); the voice reads them naturally.

## Guiding the eye
- Each war clip points once at what the map is doing ("Watch the red spread out from Germany",
  "Follow the arrows to the coast"), so the listener grasps the movement, not just hears it.
  Colours: blue = Allies, red = Axis / Central Powers, orange = occupied.

## Length
Generous: the map moves slowly while the voice speaks, so give it time.
- War event: 5–7 sentences (about 30–40 seconds).
- War (a long one, not the world wars): four chapters, `battle:<id>:0`–`:3`, 5–6 sentences each:
  the sides (who fought whom, in which colour), how it began, the fighting, how it ended (the
  result, the cost, what it changed). About 3 minutes in all.
- Battle: three chapters, `battle:<id>:0`–`:2`: the sides and the road to the battle, the battle
  itself, what it changed. About 2 minutes. (Older battles are still one clip, `battle:<id>`,
  until they're rewritten.)
- Chapters carry `cams` (sentence → [lat, lng, altitude] or "home") so the camera follows the
  places George names; each chapter also redraws the map's arrows.
- Voyage: an intro of 3–5 sentences, then 1–3 per stop.

## Words to avoid
Hype ("epic", "insane", "brutal"), modern slang, exclamation marks, and anything a guide on a
quiet museum tour wouldn't say.

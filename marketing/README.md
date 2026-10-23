# Marketing as code

Everything that decides what GeoQuest says, where, and how often lives in these files.
Edit them like code — the scripts in `scripts/marketing/` and the `/marketing-pack`,
`/reddit-drafts` and `/growth-report` commands read them every time.

| File | Steers |
|---|---|
| `voice.md` | Tone, audience, words to use and avoid, hard rules (checked by the caption validator) |
| `calendar.md` | Which video scene runs on which weekday, and the week's theme |
| `channels/shorts.md` | TikTok, Instagram Reels and YouTube Shorts: hooks, length, hashtags |
| `channels/reddit.md` | Communities, their rules, how often to post |
| `channels/seo.md` | Search pages and the phrases they target |

Generated output (not committed): `packs/<date>/` (video, cover, captions) and `reports/<week>.md`.

Posting is always done by you, from your own accounts. Nothing here posts automatically.

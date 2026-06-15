# Navigation — BMAD-easy

## Pages

- **New Conversation** — initial page when user opens the platform after onboarding.
  - chat opens with a prompt suggesting the `/` key to browse commands; does not force skill selection
  - once first message is sent, New Chat becomes Conversation, with its own unique URL
- **Existing Conversation** — opens and loads prior history on subject conversation. Shares common chat elements with New Chat
- **Project Map** — coming soon
- **Artifact Browser** — single page with two states:
  - _No artifact selected:_ full-width flat list of artifacts (**ordering TBD**)
  - _Artifact selected:_ list shrinks to make room for the selected artifact
- **Onboarding** - page where user enters repository URL and Github access token to connect the project to the platform.
- **Settings** - empty, 'coming soon'

## Side Navigation

Always visible. Contains:

- Last 5 conversations, each labeled with a 2–5 word semantic summary
- New conversation button
- _(separator)_
- Project map
- Artifact browser
- Settings — user avatar circle showing initials (MVP)

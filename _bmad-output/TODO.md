# TODO

## Documentation Corrections

- **Reframe AG-UI** — Reduce its significance in docs. It is a communication protocol that enables universal chat interfaces, not a central architectural concept. Current treatment overstates its importance.

- **Replace "artifact checkpoint"** — The term is confusing. Rename to "artifact commit" throughout docs (it is simply a manually requested artifact commit). Start in PRD, then apply to UX docs.

- **Revise commit pill description in PRD** — Current mention is overblown. Shift focus from the pill UI element to the underlying concept: custom, semantically recognized agent actions that the pill triggers.

## UX Corrections

- **Remove "View" button from committed artifact pills** — The pill itself is clickable; a separate View button is redundant. Apply fix starting from PRD screen.

- **Preserve slash command list after conversation starts** — Verify that the slash command list UX remains accessible once a chat has already been initiated (not just on the empty-state screen).

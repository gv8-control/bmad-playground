## Commits

All commits must follow Conventional Commits specification. Maintain commit message within a single line. Include only the subject line — no body, trailers, or metadata of any kind.

For BMAD artifact updates use `docs` commit type. When a commit creates or updates a BMAD artifact, the scope must reflect the artifact type:

| Artifact | Scope |
|----------|-------|
| Brainstorming output | `brainstorming` |
| Technical research report | `technical-research` |
| Market research report | `market-research` |
| Product Requirements Document | `prd` |
| Architecture document | `architecture` |
| Epic / user story | `epics` |
| UX spec or design | `ux` |
| Domain research | `domain-research` |
| Project brief | `product-brief` |
| PR/FAQ document | `prfaq` |
| Test architecture | `test-arch` |

### Examples

```
feat(brainstorming): add initial ideation session for onboarding flow
feat(technical-research): research Claude Code Agent SDK capabilities
```

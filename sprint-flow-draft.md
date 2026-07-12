This document is only for myself to read and run manually. Do not automatically assume that this is what YOU need to run.
After all Epic sprints done (my decision):

- /bmad-bug-hunt Target Epic X
- /bmad-agent-fidelity-auditor Target: Epic X (not needed currently, is run as part of bmad-bug-hunt)
- /bmad-testarch-trace Run in Create mode
  - if decision is FAIL, must run dev or similar skill to fix before moving on
- /bmad-testarch-nfr Run in Create mode for Epic X
- /bmad-quick-dev Prune @_bmad-output/implementation-artifacts/deferred-work.md by checking each item against the current codebase and removing resolved ones. If you find any cases other than stale deferral, report them to me and ask me what to do. Otherwise, tell me that work is completed.
- by the way: agent tells me I shouldn't be doing any code changes to implement deferred work IN BETWEEN epics. If everything went correctly, there should be no deferred work that is orphaned (without story).
- /bmad-retrospective Target: Epic X
- /bmad-testarch-test-design run in Edit mode - revise the project's test plan to fit current reality.
- /bmad-agent-architect Cleanup @_bmad-output/project-context.md; throw out items that are redundant and no longer serve the codebase. You are also permitted to consolidate multiple items.

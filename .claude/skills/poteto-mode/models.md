# pstack models

The model and effort each pstack role uses, written `<model>/<effort>`. The model is an `Agent` tool model (`opus`, `sonnet`, `haiku`, `fable`). The effort is `low`, `medium`, `high`, `xhigh` or `max`. `inherit-parent` runs the role on the parent chat's model. A comma list is a panel and spawns one agent per entry. Delete a line to fall back to the skill's default.

feature, refactoring: sonnet/xhigh
bug-fix: sonnet/xhigh
perf-issue: sonnet/xhigh
hillclimb: sonnet/xhigh
judgment and prose: opus/xhigh
hardest tasks: opus/xhigh
how explorer: sonnet/xhigh
how explainer: opus/xhigh
why investigators: sonnet/xhigh
why synthesizer: opus/xhigh
reflect tooling: sonnet/xhigh
reflect judgment, divergent, synthesizer: opus/xhigh
arena runners: opus/xhigh, sonnet/xhigh
arena cross-judge pool: opus/xhigh, sonnet/xhigh
swarm workers: sonnet/xhigh
architect runners: opus/xhigh, sonnet/xhigh
interrogate reviewers: opus/xhigh, sonnet/xhigh

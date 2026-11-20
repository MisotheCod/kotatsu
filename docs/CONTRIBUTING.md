# Contributing

Short version: small focused pull requests, and say what you tested.

1. Fork, then `npm install` in the root.
2. `npm run dev` runs the bridge on 8787 and the web app on 3000 with demo data.
3. `npm run typecheck` before you open a pull request.
4. Keep the copy plain and short. No dashes as punctuation.
5. A new agent kind is one adapter in `packages/bridge/src/adapters`, matching `AgentAdapter`.

If you are adding a screen, screen it at 390 wide and at 1280. The phone layout comes first.

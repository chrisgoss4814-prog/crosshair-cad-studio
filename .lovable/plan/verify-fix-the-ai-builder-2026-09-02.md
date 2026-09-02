# Verify & Fix the AI Builder

The AI integration already exists in the app:

- **UI**: the "AI" toolbar entry in `CadApp.tsx` opens the build panel (prompt in, streaming-style step preview, Accept/Reject).
- **Backend**: `src/lib/ai-build.functions.ts` (`aiBuild` server function) calls the Lovable AI Gateway with a strict JSON tool schema and returns build steps.
- **Learning**: `src/lib/ai-memory.ts` stores your style preferences and accepted/rejected builds locally and feeds them back as context.

So nothing needs to be built from scratch — this plan is about making sure it actually works end to end.

## Steps

1. **Provision the API key** — ensure a `LOVABLE_API_KEY` secret exists for the project (the AI call fails with "Missing LOVABLE_API_KEY" without it). Create it only if missing.
2. **Live test** — run a real prompt through the AI panel (e.g. "a 2 metre brick wall") and confirm:
   - the request reaches the gateway and returns steps,
   - steps render in the scene as real editable/undoable objects,
   - gateway errors (rate limit, credits) show a readable message instead of a silent failure.
3. **Fix whatever the test surfaces** — e.g. model/body mismatch (400), missing key (401), or a parsing failure — using the gateway's error message.
4. **Optional tidy**: if the AI panel is hard to find on mobile, add a short hint for it in the "? Guide" sheet.

## Technical notes

- No new dependencies; the call uses `fetch` to `https://ai.gateway.lovable.dev/v1/chat/completions` with model `google/gemini-3.7-flash`.
- Secret is read inside the server function handler only — never exposed to the browser.

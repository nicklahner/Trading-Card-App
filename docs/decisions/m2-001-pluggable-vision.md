# M2-001: Pluggable vision provider

**Date:** 2026-09-06
**Context:** Anthropic Console billing is not working. Nick has an OpenAI API key and wants to proceed with M2 identification using OpenAI vision. The system should support switching back to Claude later with no code changes.

**Decision:** The `TextExtractor` interface is implemented by two adapters — `ClaudeVisionExtractor` (Anthropic) and `OpenAIVisionExtractor` (OpenAI). Provider selection at runtime:

1. If `ANTHROPIC_API_KEY` is set → Claude adapter
2. Else if `OPENAI_API_KEY` is set → OpenAI adapter
3. Neither → error

Model IDs are configurable via `ANTHROPIC_VISION_MODEL` and `OPENAI_VISION_MODEL` env vars, defaulting to `claude-sonnet-4-6` and `gpt-5.6-terra` respectively. Switching providers or models requires only env var changes, no code changes.

Both adapters share the same system prompt, JSON schema, and Zod validation (`CardExtractionSchema`). A malformed response is always a hard failure — never a silent partial.

**Consequence:** OpenAI is the current default (only key present). When Anthropic billing is resolved, setting `ANTHROPIC_API_KEY` will automatically switch to Claude (it wins when both keys are present). Shared fixtures in `fixtures/extractions/` allow accuracy comparison across providers.

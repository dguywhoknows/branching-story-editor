# branching-story-editor

[![tests](https://github.com/dguywhoknows/branching-story-editor/actions/workflows/tests.yml/badge.svg)](https://github.com/dguywhoknows/branching-story-editor/actions/workflows/tests.yml)

Co-write branching interactive fiction with AI: a live story graph, continuity checks, play mode and Twine export.

Live: https://dguywhoknows.github.io/branching-story-editor/

## Overview

Story Weaver is a small interactive-fiction studio. Give it a premise and genre and the AI writes an opening passage with choices. Every unwritten choice appears in the graph as an orange '+'. Click one and the AI writes that branch, using the path that led there (earlier titles plus the most recent full passages) so characters and facts stay consistent. You can edit anything, wire choices to existing passages to merge branches, mark endings, rewrite passages in a different tone, and run an AI continuity check along any path. Stats flag dead ends and unreachable passages. Play mode reads it like a gamebook, and Twee 3 export opens it in Twine 2.

## Pages

- **Editor**
- **Play**
- **Analysis**
- **Library**
- **Settings**

## Features

- Layered graph layout (BFS depth) with curved edges, pan/zoom, and '+' stubs for unwritten choices
- AI branch writing with path-aware context; nudges toward endings as paths deepen
- Passage editor: title, text, endings, choices wired to new or existing passages (merge branches)
- AI suggest-choices and rewrite-in-tone (more vivid, darker, funnier, shorter, more dialogue)
- AI continuity check along the path to any passage
- Story stats: passages, endings, open threads, longest path, unreachable nodes
- Gamebook play mode with back navigation; Twee 3 (Twine 2/Harlowe) and JSON export/import
- Story variables: choices can be shown only when a condition holds (trust >= 2 && hasKey) and can change variables when taken (trust += 1; hasKey = true); passages can show {variables} and {if …}…{/if} text. Expressions use a small tokenizer and recursive-descent parser, never eval
- Analysis page: explores every reachable (passage, variables) state to report which endings can actually be reached and how often, unreachable passages, dead ends, choices whose conditions can never be met, unwritten choices and invalid logic
- Export a single self-contained HTML file that plays the story in any browser, alongside JSON and Twee 3 for Twine 2 with variables translated to Harlowe (set:)/(if:) macros
- Play page with a variable inspector, back button, and play-from-here
- Library page: several stories per browser, duplicate, delete, import
- Graph shows conditional links dashed and greys out passages no reader can reach; fit-to-view

## How it works

LLM calls are used for:

- Opening + branch generation (JSON) with rolling path context
- Continuity auditing, choice suggestions and tone rewrites

Everything else (graph model, layout, editing, statistics, play mode, Twee/JSON serialization) runs locally in the browser.

## Getting started

No build step and no dependencies. Serve the folder with any static server:

```bash
git clone https://github.com/dguywhoknows/branching-story-editor.git
cd branching-story-editor
python -m http.server 8000
```

Then open http://localhost:8000.

`index.html` is the public home page, `login.html` handles accounts and `app.html` is the app.

### Telling the app what to do

Every page has an **Ask AI** box (Ctrl/Cmd+K). Type a request in plain words and the model plans a sequence of
calls to the app's own functions, runs them and reports back. The **Instructions** tab stores standing
preferences that are added to every AI request the app makes.

### Configuration

`src/lib/config.js` is generated from the build settings: the Supabase project (accounts) and the AI proxy URL.
Signed-in users get the built-in AI through the proxy, which keeps the provider key as a server-side secret.
Without those settings the app runs for guests, in demo mode, or with a personal [Groq](https://console.groq.com/keys)
or [OpenRouter](https://openrouter.ai/keys) key entered under **Settings → Model provider** (stored only in this
browser and sent only to that provider).

## Testing

`src/core.js` holds the app's logic as pure functions and is covered by 7 unit tests.

```bash
node tests/run-node.js        # CI runs this on every push
```

Or open `tests/index.html` in a browser ([live](https://dguywhoknows.github.io/branching-story-editor/tests/)).

## Project structure

```
index.html           public home page (generated)
login.html           sign-in and sign-up (generated)
app.html             the app: markup for every page
src/app.js           UI, page wiring and event handlers
src/core.js          pure logic with no DOM access (unit-tested)
src/demo.js          sample responses used when no API key is configured
src/lib/ai.js        LLM client: Groq / OpenRouter, streaming, JSON mode, retries
src/lib/dom.js       DOM helpers, namespaced storage, markdown renderer
src/lib/router.js    hash router and the Settings page
src/lib/copilot.js   AI command box that drives the app's own functions
src/lib/auth.js      accounts (Supabase Auth) and the sign-in gate
styles/base.css      design tokens and shared components
styles/app.css       app-specific styles
tests/               unit tests (browser runner + Node runner for CI)
```

## Tech

- Graph algorithms: BFS layering, DFS longest path, reachability
- SVG graph rendering with pan/zoom
- Twee 3 interchange format
- Graph helpers, the expression language, state-space exploration and exporters in src/core.js covered by unit tests run in the browser and in CI
- Vanilla JavaScript, no framework or bundler
- Deployed with GitHub Pages

## License

MIT

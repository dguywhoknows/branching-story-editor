const { $, $$, h, esc, busy, toast, download, store } = Kit;
const NS = 'http://www.w3.org/2000/svg';
const uid = (p = 'p') => p + Math.random().toString(36).slice(2, 8);
const clone = (x) => JSON.parse(JSON.stringify(x));

/* ================= library ================= */
let library = store.get('weaver.library', null);
if (!library) {
  const old = store.get('weaver.story', null);
  library = [{ id: uid('s'), updated: Date.now(), story: old && old.root ? Object.assign({ vars: {} }, old) : clone(SAMPLE_STORY) }];
}
let curId = store.get('weaver.current', library[0].id);
const entry = () => library.find((x) => x.id === curId) || library[0];
let S = entry().story;
const save = () => { entry().updated = Date.now(); store.set('weaver.library', library); store.set('weaver.current', curId); };
let sel = S.root, view = { x: 40, y: 40, k: 1 };

/* ================= graph ================= */
function el(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent?.appendChild(e); return e; }
const W = 170, H = 54;
function renderGraph() {
  const svg = $('#graph');
  svg.innerHTML = '';
  const pos = layoutGraph(S), reach = explore(S, 3000), reached = new Set(reach.reached);
  const g = el('g', { id: 'vp', transform: `translate(${view.x},${view.y}) scale(${view.k})` }, svg);
  Object.values(S.nodes).forEach((n) => {
    const p = pos[n.id];
    n.choices.forEach((c, ci) => {
      const sy = p.y + H / 2 - 4 + (ci - (n.choices.length - 1) / 2) * 10;
      if (c.to && pos[c.to]) {
        const q = pos[c.to], back = q.x <= p.x;
        const d = back ? `M${p.x + W / 2},${p.y + H} C${p.x + W / 2},${p.y + H + 50} ${q.x + W / 2},${q.y + H + 50} ${q.x + W / 2},${q.y + H}` : `M${p.x + W},${sy} C${p.x + W + 40},${sy} ${q.x - 40},${q.y + H / 2} ${q.x},${q.y + H / 2}`;
        const path = el('path', { class: 'gedge', d, 'stroke-dasharray': c.if ? '6 3' : '' }, g);
        el('title', {}, path).textContent = c.label + (c.if ? `  [if ${c.if}]` : '') + (c.set ? `  [set ${c.set}]` : '');
      } else if (!c.to) {
        el('path', { class: 'gedge dangling', d: `M${p.x + W},${sy} L${p.x + W + 34},${sy + (ci - 1) * 8}` }, g);
        const plus = el('g', { class: 'gnode', transform: `translate(${p.x + W + 42},${sy + (ci - 1) * 8})` }, g);
        el('circle', { r: 8, class: 'open' }, plus);
        const t = el('text', { 'text-anchor': 'middle', y: 4, style: 'fill:#fff;font-size:12px' }, plus); t.textContent = '+';
        el('title', {}, plus).textContent = `Write: “${c.label}”`;
        plus.onclick = (e) => { e.stopPropagation(); busy(null, () => expand(n.id, ci)); };
      }
    });
  });
  Object.values(S.nodes).forEach((n) => {
    const p = pos[n.id];
    const gn = el('g', { class: 'gnode' + (n.id === sel ? ' sel' : '') + (n.id === S.root ? ' root' : '') + (n.ending ? ' ending' : '') + (reached.has(n.id) ? '' : ' closed'), transform: `translate(${p.x},${p.y})` }, g);
    el('rect', { width: W, height: H, rx: 10 }, gn);
    const t = el('text', { x: 10, y: 22 }, gn); t.textContent = (n.id === S.root ? 'Start · ' : n.ending ? 'End · ' : '') + (n.title.length > 19 ? n.title.slice(0, 18) + '…' : n.title);
    const s = el('text', { x: 10, y: 40, class: 'sub' }, gn); s.textContent = `${(n.text.match(/\S+/g) || []).length} words · ${n.choices.length} choice${n.choices.length === 1 ? '' : 's'}${reached.has(n.id) ? '' : ' · unreachable'}`;
    gn.onclick = (e) => { e.stopPropagation(); select(n.id); };
  });
  const st = storyStats(S);
  $('#storyTitle').textContent = S.title || 'Untitled story';
  $('#stats').textContent = `${st.passages} passages · ${st.endings} endings · ${st.open} open threads · ${st.words.toLocaleString()} words${reach.unreachable.length ? ` · ${reach.unreachable.length} unreachable` : ''}`;
}
function applyView() { $('#vp')?.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.k})`); }
function fitView() {
  const pos = Object.values(layoutGraph(S)), box = $('#graph').getBoundingClientRect();
  if (!pos.length || !box.width) return;
  const minX = Math.min(...pos.map((p) => p.x)), maxX = Math.max(...pos.map((p) => p.x)) + W + 60, minY = Math.min(...pos.map((p) => p.y)), maxY = Math.max(...pos.map((p) => p.y)) + H + 60;
  view.k = Math.max(0.3, Math.min(1.2, Math.min(box.width / (maxX - minX + 40), box.height / (maxY - minY + 40))));
  view.x = 20 - minX * view.k; view.y = 20 - minY * view.k;
  applyView();
}
let drag = null;
$('#graph').addEventListener('pointerdown', (e) => { if (e.target.closest('.gnode')) return; drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; $('#graph').setPointerCapture(e.pointerId); });
$('#graph').addEventListener('pointermove', (e) => { if (!drag) return; view.x = drag.vx + e.clientX - drag.x; view.y = drag.vy + e.clientY - drag.y; applyView(); });
$('#graph').addEventListener('pointerup', () => (drag = null));
$('#graph').addEventListener('wheel', (e) => { e.preventDefault(); const r = $('#graph').getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, k2 = Math.min(2.5, Math.max(0.25, view.k * Math.exp(-e.deltaY * 0.0015))); view.x = mx - ((mx - view.x) * k2) / view.k; view.y = my - ((my - view.y) * k2) / view.k; view.k = k2; applyView(); }, { passive: false });
$('#fitView').onclick = fitView;
$('#addPassage').onclick = () => { const id = uid(); S.nodes[id] = { id, title: 'New passage', text: '', ending: false, choices: [] }; save(); select(id); };

/* ================= passage editor ================= */
function exprInput(c, key, placeholder, isEffect) {
  const inp = h('input', { class: 'input', value: c[key] || '', placeholder, title: isEffect ? 'Effects when chosen, e.g. trust += 1; hasKey = true' : 'Only show this choice when…, e.g. trust >= 2 && hasKey', 'aria-label': isEffect ? 'Effects' : 'Condition' });
  const check = () => { const err = inp.value.trim() ? checkExpr(inp.value, isEffect) : null; inp.classList.toggle('bad', !!err); inp.title = err || inp.title; return err; };
  inp.oninput = () => { if (!check()) { if (inp.value.trim()) c[key] = inp.value.trim(); else delete c[key]; save(); renderGraph(); } };
  check();
  return inp;
}
function select(id) {
  sel = id;
  renderGraph();
  const n = S.nodes[id], box = $('#editor');
  box.innerHTML = '';
  if (!n) { box.append(h('div', { class: 'empty' }, 'Select a passage.')); return; }
  const others = Object.values(S.nodes).filter((x) => x.id !== n.id);
  const text = h('textarea', { 'aria-label': 'Passage text', oninput: (e) => { n.text = e.target.value; save(); } });
  text.value = n.text;
  const choiceCard = (c, ci) => h('div', { class: 'choice-card' },
    h('div', { class: 'choice' },
      h('input', { class: 'input', value: c.label, 'aria-label': 'Choice text', oninput: (e) => { c.label = e.target.value; save(); } }),
      h('select', { style: 'width:130px;padding:6px', 'aria-label': 'Leads to', onchange: (e) => { c.to = e.target.value || null; save(); renderGraph(); select(id); } }, h('option', { value: '' }, 'unwritten'), others.map((o) => h('option', { value: o.id, selected: c.to === o.id }, o.title.slice(0, 26)))),
      c.to ? h('button', { class: 'btn sm ghost', title: 'Go to passage', onclick: () => select(c.to) }, 'Open') : h('button', { class: 'btn sm primary', title: 'Generate this branch', onclick: (e) => busy(e.currentTarget, () => expand(n.id, ci)) }, 'Write')),
    h('div', { class: 'logic' }, exprInput(c, 'if', 'show if…', false), exprInput(c, 'set', 'then set…', true)),
    h('div', { class: 'row', style: 'justify-content:flex-end' }, ci > 0 ? h('button', { class: 'btn ghost sm', onclick: () => { [n.choices[ci - 1], n.choices[ci]] = [n.choices[ci], n.choices[ci - 1]]; save(); select(id); } }, 'Move up') : '', h('button', { class: 'btn ghost sm', onclick: () => { n.choices.splice(ci, 1); save(); select(id); } }, 'Remove')));
  box.append(
    h('div', { class: 'row between' }, h('span', { class: 'small muted' }, pathTo(S, id).map((p) => S.nodes[p].title).join(' › ') || 'not reachable from the start'),
      id !== S.root ? h('div', { class: 'row' }, h('button', { class: 'btn sm ghost', onclick: () => { S.root = id; save(); select(id); } }, 'Make start'), h('button', { class: 'btn sm ghost danger', onclick: () => removeNode(id) }, 'Delete')) : h('span', { class: 'tag accent' }, 'start')),
    h('label', {}, 'Title', h('input', { class: 'input', value: n.title, oninput: (e) => { n.title = e.target.value; save(); renderGraph(); } })),
    h('label', {}, 'Passage ', h('span', { class: 'small muted' }, 'use {name} to show a variable, {if cond}…{/if} for conditional text'), text),
    h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!n.ending, onchange: (e) => { n.ending = e.target.checked; if (n.ending) n.choices = []; save(); select(id); } }), ' This is an ending'),
    !n.ending ? h('div', { class: 'stack' }, h('h3', { style: 'margin:6px 0 0' }, 'Choices'), ...n.choices.map(choiceCard),
      h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => { n.choices.push({ label: 'New choice', to: null }); save(); select(id); } }, 'Add choice'), h('button', { class: 'btn sm ghost', onclick: (e) => busy(e.currentTarget, () => suggestChoices(id)) }, 'Suggest choices'))) : '',
    h('div', { class: 'row' }, h('select', { id: 'tone', style: 'width:auto', 'aria-label': 'Rewrite style' }, ['more vivid', 'darker', 'funnier', 'shorter', 'more dialogue'].map((t) => h('option', {}, t))), h('button', { class: 'btn sm', onclick: (e) => busy(e.currentTarget, () => rewrite(id)) }, 'Rewrite passage'), h('button', { class: 'btn sm ghost', onclick: () => { Router.go('play'); play(id); } }, 'Play from here')));
}
function removeNode(id) {
  if (!confirm(`Delete "${S.nodes[id].title}"?`)) return;
  delete S.nodes[id];
  Object.values(S.nodes).forEach((n) => n.choices.forEach((c) => { if (c.to === id) c.to = null; }));
  save(); select(S.root);
}
function renderStoryPanel() {
  const box = $('#storyPanel');
  box.innerHTML = '';
  const used = usedVariables(S), vars = S.vars || (S.vars = {});
  const parseVal = (v) => (v === 'true' ? true : v === 'false' ? false : v !== '' && !isNaN(+v) ? +v : v.replace(/^"|"$/g, ''));
  box.append(
    h('label', {}, 'Title', h('input', { class: 'input', value: S.title || '', oninput: (e) => { S.title = e.target.value; save(); renderGraph(); } })),
    h('label', {}, 'Premise', h('textarea', { rows: 3, oninput: (e) => { S.premise = e.target.value; save(); } }, S.premise || '')),
    h('label', {}, 'Genre', h('select', { onchange: (e) => { S.genre = e.target.value; save(); } }, ['mystery', 'sci-fi', 'fantasy', 'horror', 'romance', 'comedy'].map((g) => h('option', { selected: g === S.genre }, g)))),
    h('h3', { style: 'margin:8px 0 0' }, 'Variables'),
    h('p', { class: 'small muted', style: 'margin:0' }, 'Starting values. Choices can test them (show if) and change them (then set).'),
    ...Object.keys(vars).map((k) => h('div', { class: 'var-row' }, h('input', { class: 'input', value: k, disabled: true, 'aria-label': 'Name' }), h('input', { class: 'input', value: JSON.stringify(vars[k]).replace(/^"|"$/g, ''), 'aria-label': `Starting value of ${k}`, onchange: (e) => { vars[k] = parseVal(e.target.value.trim()); save(); renderGraph(); } }), h('button', { class: 'btn ghost sm', 'aria-label': 'Remove variable', onclick: () => { delete vars[k]; save(); renderStoryPanel(); } }, '×'))),
    h('form', { class: 'var-row', onsubmit: (e) => { e.preventDefault(); const name = e.target.vname.value.trim(); if (!/^[A-Za-z_]\w*$/.test(name)) return toast('Use letters, digits and _ for names', 'err'); vars[name] = parseVal(e.target.vval.value.trim() || '0'); save(); renderStoryPanel(); } },
      h('input', { class: 'input', name: 'vname', placeholder: 'name', 'aria-label': 'New variable name' }), h('input', { class: 'input', name: 'vval', placeholder: '0, true, "text"', 'aria-label': 'Starting value' }), h('button', { class: 'btn sm', type: 'submit' }, 'Add')),
    used.filter((u) => !(u in vars)).length ? h('p', { class: 'small', style: 'color:var(--warn)' }, `Used but not declared (they start at 0): ${used.filter((u) => !(u in vars)).join(', ')}`) : '',
    h('h3', { style: 'margin:8px 0 0' }, 'Export'),
    h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => download(`${slug()}.html`, toStandaloneHTML(S), 'text/html') }, 'Playable HTML'), h('button', { class: 'btn sm ghost', onclick: exportTwee }, 'Twee (Twine 2)'), h('button', { class: 'btn sm ghost', onclick: () => download(`${slug()}.json`, JSON.stringify(S, null, 2), 'application/json') }, 'JSON')));
}
const slug = () => (S.title || 'story').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function exportTwee() {
  const ifid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); }).toUpperCase();
  download(`${slug()}.twee`, toTwee(S, ifid), 'text/plain');
  toast('Twee 3 file saved. Import it into Twine 2.');
}
$$('#edTabs button').forEach((b) => (b.onclick = () => { $$('#edTabs button').forEach((x) => x.classList.toggle('on', x === b)); $('#editor').classList.toggle('hidden', b.dataset.t !== 'passage'); $('#storyPanel').classList.toggle('hidden', b.dataset.t !== 'story'); if (b.dataset.t === 'story') renderStoryPanel(); }));

/* ================= AI ================= */
function context(id) {
  const p = pathTo(S, id);
  const early = p.slice(0, -3).map((x) => `- ${S.nodes[x].title}`).join('\n');
  const recent = p.slice(-3).map((x) => `## ${S.nodes[x].title}\n${S.nodes[x].text}`).join('\n\n');
  return `Premise: ${S.premise}\nGenre: ${S.genre}\n${early ? 'Earlier passages (titles):\n' + early + '\n\n' : ''}Most recent passages:\n${recent}`;
}
const SYS = () => `You are co-writing a branching ${S.genre} interactive story in second person, present tense. Keep characters, facts and tone consistent with the story so far. Passages are 110-180 words with sensory detail and end on a moment of decision. Choices are short (3-8 words), meaningfully different, and each leads somewhere interesting.`;
async function newStory(premise, genre) {
  const story = { title: 'Untitled story', premise, genre, root: null, vars: {}, nodes: {} };
  S = story;
  const out = await AI.chat([{ role: 'system', content: SYS() + ' Return JSON {"story_title":"","title":"passage title","text":"","choices":["","",""]}.' }, { role: 'user', content: `Write the opening passage. Premise: ${premise}` }], { json: true, temperature: 0.9, demo: () => DEMO_OPEN });
  const id = uid();
  story.title = out.story_title || 'Untitled story';
  story.nodes[id] = { id, title: out.title || 'Opening', text: out.text || '', ending: false, choices: (out.choices || []).slice(0, 3).map((l) => ({ label: l, to: null })) };
  story.root = id;
  addToLibrary(story);
}
function addToLibrary(story) {
  const e = { id: uid('s'), updated: Date.now(), story };
  library.unshift(e);
  openStory(e.id);
}
function openStory(id) {
  curId = id; S = entry().story; sel = S.root; view = { x: 40, y: 40, k: 1 };
  save();
  Router.go('editor');
  select(S.root);
  setTimeout(fitView, 50);
}
async function expand(fromId, ci) {
  const from = S.nodes[fromId], choice = from.choices[ci], depth = pathTo(S, fromId).length;
  const out = await AI.chat([
    { role: 'system', content: SYS() + ` Return JSON {"title":"","text":"","choices":["2-3 choices, or [] if this is an ending"],"ending":true|false}. ${depth >= 5 ? 'The story is getting long: strongly consider making this an ending (good, bad or bittersweet).' : 'Do not end the story yet.'}` },
    { role: 'user', content: `${context(fromId)}\n\nThe reader chose: “${choice.label}”. Write what happens next.` },
  ], { json: true, temperature: 0.9, demo: () => demoNext(choice, depth) });
  const id = uid(), ending = !!out.ending || !(out.choices || []).length;
  S.nodes[id] = { id, title: out.title || choice.label, text: out.text || '', ending, choices: ending ? [] : out.choices.slice(0, 3).map((l) => ({ label: l, to: null })) };
  choice.to = id;
  save(); select(id);
}
async function suggestChoices(id) {
  const out = await AI.chat([{ role: 'system', content: SYS() + ' Return JSON {"choices":["","",""]}.' }, { role: 'user', content: `${context(id)}\n\nSuggest 3 new choices for the reader at the end of the last passage, different from: ${S.nodes[id].choices.map((c) => c.label).join('; ') || 'none'}.` }], { json: true, temperature: 1, demo: { choices: ['Search the cellar', 'Wait until dawn', 'Call out into the dark'] } });
  (out.choices || []).forEach((l) => S.nodes[id].choices.push({ label: l, to: null }));
  save(); select(id);
}
async function rewrite(id) {
  const n = S.nodes[id];
  n.text = await AI.chat([{ role: 'system', content: SYS() + ' Output only the rewritten passage text.' }, { role: 'user', content: `${context(id)}\n\nRewrite the LAST passage to be ${$('#tone').value}, keeping the same events and ending beat.` }], { temperature: 0.8, demo: n.text });
  if (AI.mode() === 'demo') toast('Rewriting needs a model provider (Settings)');
  save(); select(id);
}

/* ================= play ================= */
let trail = [], debugVars = false;
function play(from = S.root) { trail = [{ id: from, vars: Object.assign({}, S.vars || {}) }]; page(); }
function page() {
  const r = $('#reader');
  r.innerHTML = '';
  if (!S.nodes[S.root]) { r.append(h('div', { class: 'empty' }, 'This story has no passages yet.')); return; }
  if (!trail.length) play();
  const step = trail[trail.length - 1], n = S.nodes[step.id];
  const open = n.choices.filter((c) => c.to && S.nodes[c.to] && choiceOpen(c, step.vars));
  r.append(h('div', { class: 'story-page' },
    h('div', { class: 'crumbs row between' }, h('span', {}, `${S.title || 'Story'} · passage ${trail.length}`), h('label', { class: 'chk small' }, h('input', { type: 'checkbox', checked: debugVars, onchange: (e) => { debugVars = e.target.checked; page(); } }), ' show variables')),
    debugVars ? h('div', { class: 'vars-strip' }, Object.keys(step.vars).length ? Object.entries(step.vars).map(([k, v]) => h('span', {}, `${k} = ${JSON.stringify(v)}`)) : 'no variables') : '',
    h('h2', {}, n.title),
    ...renderText(n.text, step.vars).split(/\n+/).map((p) => h('p', {}, p)),
    h('div', { class: 'choices' },
      n.ending ? [h('div', { class: 'tag accent', style: 'justify-self:start' }, 'The end'), h('button', { class: 'btn primary', onclick: () => play() }, 'Play again')]
        : open.length ? open.map((c) => h('button', { class: 'btn', onclick: () => { let v = step.vars; try { v = applyEffects(c.set, v); } catch {} trail.push({ id: c.to, vars: v }); page(); window.scrollTo(0, 0); } }, c.label))
          : h('p', { class: 'muted' }, n.choices.some((c) => !c.to) ? 'The next part is not written yet. Open the editor and press Write.' : 'No choice is available with the current variables: this is a dead end.'),
      trail.length > 1 ? h('button', { class: 'btn ghost sm', style: 'justify-self:start', onclick: () => { trail.pop(); page(); } }, 'Back') : '')));
}

/* ================= analysis ================= */
function renderAnalysis() {
  const r = explore(S, 20000), st = storyStats(S), names = (id) => S.nodes[id]?.title || id;
  const totalEnd = Object.values(r.endings).reduce((a, b) => a + b, 0);
  $('#anKpis').innerHTML = [['Passages', st.passages], ['Reachable', `${r.reached.length}/${st.passages}`], ['Endings reachable', `${Object.keys(r.endings).length}/${st.endings}`], ['States explored', r.states + (r.truncated ? '+' : '')], ['Longest route', r.maxDepth + ' passages'], ['Reading time', `~${Math.max(1, Math.round(st.words / 230))} min total`]]
    .map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
  const go = (id) => h('a', { onclick: () => { Router.go('editor'); select(id); } }, names(id));
  const E = $('#anEndings');
  E.innerHTML = '';
  Object.values(S.nodes).filter((n) => n.ending).forEach((n) => E.append(h('div', { class: 'an-row' }, go(n.id), h('span', { class: r.endings[n.id] ? 'small' : 'small', style: r.endings[n.id] ? '' : 'color:var(--bad)' }, r.endings[n.id] ? `${Math.round((100 * r.endings[n.id]) / totalEnd)}% of end states` : 'never reached'))));
  if (!E.children.length) E.append(h('div', { class: 'empty' }, 'No endings yet. Mark a passage as an ending.'));
  const P = $('#anProblems');
  P.innerHTML = '';
  const add = (label, id, detail) => P.append(h('div', { class: 'an-row' }, h('span', {}, label, ': ', go(id)), h('span', { class: 'small muted' }, detail)));
  r.unreachable.forEach((id) => add('Unreachable', id, 'no route leads here'));
  r.deadEnds.forEach((id) => add('Dead end', id, 'no choice is available in some states'));
  r.neverOpen.forEach((x) => add('Choice never available', x.id, `“${x.label}”`));
  Object.values(S.nodes).forEach((n) => n.choices.forEach((c) => { if (!c.to) add('Unwritten choice', n.id, `“${c.label}”`); ['if', 'set'].forEach((k) => { const err = c[k] ? checkExpr(c[k], k === 'set') : null; if (err) add('Invalid logic', n.id, `${k}: ${err}`); }); }));
  usedVariables(S).filter((u) => !(u in (S.vars || {}))).forEach((u) => P.append(h('div', { class: 'an-row' }, h('span', {}, 'Undeclared variable: ', h('b', { class: 'mono' }, u)), h('span', { class: 'small muted' }, 'starts at 0'))));
  if (r.truncated) P.append(h('div', { class: 'an-row' }, h('span', {}, 'State space is very large'), h('span', { class: 'small muted' }, 'a counter may grow without limit')));
  if (!P.children.length) P.append(h('div', { class: 'empty' }, 'No problems found.'));
}
$('#runExplore').onclick = renderAnalysis;
$('#runCheck').onclick = (e) => busy(e.currentTarget, async () => {
  const p = pathTo(S, sel || S.root);
  const out = await AI.chat([
    { role: 'system', content: 'You are a meticulous story editor. Read this path through a branching story and list continuity problems: contradictions in facts, names, objects, time of day, character knowledge, or tone breaks. Return JSON {"ok":true|false,"issues":[{"passage":"title","problem":"","fix":""}]}.' },
    { role: 'user', content: p.map((x) => `## ${S.nodes[x].title}\n${S.nodes[x].text}`).join('\n\n') },
  ], { json: true, temperature: 0.2, demo: { ok: true, issues: [] } });
  $('#checkCard').classList.remove('hidden');
  $('#checkOut').innerHTML = `<p class="small muted">Path: ${p.map((x) => esc(S.nodes[x].title)).join(' › ')}</p>` + (out.ok || !(out.issues || []).length ? '<p>No continuity problems found on this path.</p>' : `<ul class="issues">${out.issues.map((i) => `<li><b>${esc(i.passage)}:</b> ${esc(i.problem)}<br><span class="muted">Fix: ${esc(i.fix)}</span></li>`).join('')}</ul>`);
});

/* ================= library page ================= */
function renderLibrary() {
  $('#libSummary').textContent = `${library.length} stor${library.length === 1 ? 'y' : 'ies'} saved in this browser`;
  const box = $('#libList');
  box.innerHTML = '';
  library.slice().sort((a, b) => b.updated - a.updated).forEach((e) => {
    const st = storyStats(e.story);
    box.append(h('div', { class: 'card story-card' + (e.id === curId ? ' cur' : '') },
      h('h2', {}, e.story.title || 'Untitled'), h('div', { class: 'small muted' }, e.story.premise || ''),
      h('div', { class: 'small' }, `${st.passages} passages · ${st.endings} endings · ${st.words.toLocaleString()} words · ${Object.keys(e.story.vars || {}).length} variables`),
      h('div', { class: 'small muted' }, 'Edited ' + new Date(e.updated).toLocaleString()),
      h('div', { class: 'row' }, h('button', { class: 'btn sm primary', onclick: () => openStory(e.id) }, 'Open'),
        h('button', { class: 'btn sm ghost', onclick: () => { const c = clone(e.story); c.title = (c.title || 'Story') + ' (copy)'; library.unshift({ id: uid('s'), updated: Date.now(), story: c }); save(); renderLibrary(); } }, 'Duplicate'),
        h('button', { class: 'btn sm ghost danger', onclick: () => { if (library.length === 1) return toast('Keep at least one story', 'err'); if (!confirm(`Delete "${e.story.title}"?`)) return; library = library.filter((x) => x !== e); if (curId === e.id) { curId = library[0].id; S = entry().story; sel = S.root; } save(); renderLibrary(); } }, 'Delete'))));
  });
}
$('#newStory').onclick = (e) => busy(e.currentTarget, () => newStory($('#premise').value.trim(), $('#genre').value));
$('#blankStory').onclick = () => { const id = uid(); addToLibrary({ title: 'Untitled story', premise: $('#premise').value.trim(), genre: $('#genre').value, root: id, vars: {}, nodes: { [id]: { id, title: 'Opening', text: '', ending: false, choices: [{ label: 'First choice', to: null }] } } }); };
$('#importJson').onchange = async (e) => {
  try {
    const d = JSON.parse(await e.target.files[0].text());
    if (!d.nodes || !d.root) throw new Error('That file is not a story export');
    d.vars = d.vars || {};
    addToLibrary(d);
    toast('Story imported');
  } catch (err) { toast(err.message, 'err'); }
  e.target.value = '';
};

/* ================= boot ================= */
Router.on('editor', () => { select(sel && S.nodes[sel] ? sel : S.root); });
Router.on('play', () => { if (!trail.length || !S.nodes[trail[trail.length - 1].id]) play(); else page(); });
Router.on('analysis', renderAnalysis);
Router.on('library', renderLibrary);
save();
select(S.root);
setTimeout(fitView, 50);

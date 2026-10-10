/* Story graph helpers, a small safe expression language for variables and conditions, state-space exploration, layout and exporters (pure, unit-tested). */

/* ---------- graph ---------- */
function bfsParents(story) {
  var par = {}, order = [];
  if (!story.root || !story.nodes[story.root]) return { par: par, order: order };
  par[story.root] = null; order.push(story.root);
  for (var i = 0; i < order.length; i++) {
    (story.nodes[order[i]].choices || []).forEach(function (c) { if (c.to && story.nodes[c.to] && !(c.to in par)) { par[c.to] = order[i]; order.push(c.to); } });
  }
  return { par: par, order: order };
}
function pathTo(story, id) { var par = bfsParents(story).par, p = [], cur = id; while (cur != null && story.nodes[cur] && p.indexOf(cur) < 0) { p.unshift(cur); cur = par[cur]; } return p; }
function storyStats(story) {
  var ids = Object.keys(story.nodes), par = bfsParents(story).par, longest = 0;
  var dfs = function (id, d, seen) { longest = Math.max(longest, d); story.nodes[id].choices.forEach(function (c) { if (c.to && story.nodes[c.to] && !seen[c.to]) { seen[c.to] = 1; dfs(c.to, d + 1, seen); delete seen[c.to]; } }); };
  if (story.nodes[story.root]) { var s0 = {}; s0[story.root] = 1; dfs(story.root, 1, s0); }
  return {
    passages: ids.length,
    endings: ids.filter(function (id) { return story.nodes[id].ending; }).length,
    open: ids.reduce(function (a, id) { return a + story.nodes[id].choices.filter(function (c) { return !c.to; }).length; }, 0),
    unreachable: ids.filter(function (id) { return !(id in par); }),
    words: ids.reduce(function (a, id) { return a + (String(story.nodes[id].text).match(/\S+/g) || []).length; }, 0),
    longest: longest,
  };
}
/* Layered layout by BFS depth; unreachable passages go in a final column. */
function layoutGraph(story, colW, rowH) {
  colW = colW || 240; rowH = rowH || 96;
  var b = bfsParents(story), depth = {}, maxD = 0;
  b.order.forEach(function (id) { depth[id] = b.par[id] == null ? 0 : depth[b.par[id]] + 1; maxD = Math.max(maxD, depth[id]); });
  Object.keys(story.nodes).forEach(function (id) { if (!(id in depth)) depth[id] = maxD + 1; });
  var layers = {};
  b.order.concat(Object.keys(story.nodes).filter(function (id) { return b.order.indexOf(id) < 0; })).forEach(function (id) { (layers[depth[id]] = layers[depth[id]] || []).push(id); });
  var maxN = Math.max.apply(null, Object.keys(layers).map(function (k) { return layers[k].length; }).concat([1])), pos = {};
  Object.keys(layers).forEach(function (d) { layers[d].forEach(function (id, i) { pos[id] = { x: +d * colW, y: (i - (layers[d].length - 1) / 2) * rowH + (maxN * rowH) / 2 }; }); });
  return pos;
}

/* ---------- expression language ---------- */
function tokenizeExpr(src) {
  var re = /\s*(?:(\d+(?:\.\d+)?)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\+=|-=|==|!=|>=|<=|&&|\|\||[-+*/()<>=!;,])|([A-Za-z_][A-Za-z0-9_]*))/y, out = [], m;
  src = String(src);
  re.lastIndex = 0;
  while (re.lastIndex < src.length) {
    if (/^\s*$/.test(src.slice(re.lastIndex))) break;
    var at = re.lastIndex;
    m = re.exec(src);
    if (!m) throw new Error('Unexpected "' + src.slice(at, at + 8) + '"');
    if (m[1]) out.push({ t: 'num', v: +m[1] });
    else if (m[2]) out.push({ t: 'str', v: m[2].slice(1, -1).replace(/\\(.)/g, '$1') });
    else if (m[3]) out.push({ t: 'op', v: m[3] });
    else { var w = m[4]; out.push(w === 'true' || w === 'false' ? { t: 'bool', v: w === 'true' } : w === 'and' ? { t: 'op', v: '&&' } : w === 'or' ? { t: 'op', v: '||' } : w === 'not' ? { t: 'op', v: '!' } : { t: 'id', v: w }); }
  }
  return out;
}
function parseExprTokens(toks, pos) {
  var i = pos || 0;
  var peek = function (v) { return toks[i] && toks[i].t === 'op' && toks[i].v === v; };
  var or = function () { var l = and(); while (peek('||')) { i++; var r = and(); l = { op: '||', l: l, r: r }; } return l; };
  var and = function () { var l = not(); while (peek('&&')) { i++; var r = not(); l = { op: '&&', l: l, r: r }; } return l; };
  var not = function () { if (peek('!')) { i++; return { op: '!', a: not() }; } return cmp(); };
  var cmp = function () { var l = add(); while (toks[i] && toks[i].t === 'op' && ['==', '!=', '>=', '<=', '>', '<'].indexOf(toks[i].v) >= 0) { var op = toks[i++].v; l = { op: op, l: l, r: add() }; } return l; };
  var add = function () { var l = mul(); while (peek('+') || peek('-')) { var op = toks[i++].v; l = { op: op, l: l, r: mul() }; } return l; };
  var mul = function () { var l = unary(); while (peek('*') || peek('/')) { var op = toks[i++].v; l = { op: op, l: l, r: unary() }; } return l; };
  var unary = function () { if (peek('-')) { i++; return { op: 'neg', a: unary() }; } return primary(); };
  var primary = function () {
    var t = toks[i++];
    if (!t) throw new Error('Unexpected end of expression');
    if (t.t === 'num' || t.t === 'str' || t.t === 'bool') return { lit: t.v };
    if (t.t === 'id') return { id: t.v };
    if (t.t === 'op' && t.v === '(') { var e = or(); if (!peek(')')) throw new Error('Missing ")"'); i++; return e; }
    throw new Error('Unexpected "' + t.v + '"');
  };
  var node = or();
  return { node: node, next: i };
}
function evalNode(n, vars) {
  if ('lit' in n) return n.lit;
  if ('id' in n) return vars[n.id] === undefined ? 0 : vars[n.id];
  if (n.op === '!') return !evalNode(n.a, vars);
  if (n.op === 'neg') return -evalNode(n.a, vars);
  if (n.op === '&&') return evalNode(n.l, vars) && evalNode(n.r, vars);
  if (n.op === '||') return evalNode(n.l, vars) || evalNode(n.r, vars);
  var a = evalNode(n.l, vars), b = evalNode(n.r, vars);
  switch (n.op) {
    case '+': return a + b; case '-': return a - b; case '*': return a * b; case '/': return b === 0 ? 0 : a / b;
    case '==': return a === b; case '!=': return a !== b; case '>': return a > b; case '<': return a < b; case '>=': return a >= b; case '<=': return a <= b;
  }
  throw new Error('Unknown operator ' + n.op);
}
function evalExpr(src, vars) {
  if (!String(src || '').trim()) return true;
  var toks = tokenizeExpr(src), p = parseExprTokens(toks, 0);
  if (p.next !== toks.length) throw new Error('Unexpected "' + toks[p.next].v + '"');
  return evalNode(p.node, vars || {});
}
/* "trust += 1; hasKey = true, name = \"Ana\"" -> new vars object. */
function applyEffects(src, vars) {
  var out = Object.assign({}, vars), toks = tokenizeExpr(src || ''), i = 0;
  while (i < toks.length) {
    if (toks[i].t === 'op' && (toks[i].v === ';' || toks[i].v === ',')) { i++; continue; }
    var name = toks[i], op = toks[i + 1];
    if (!name || name.t !== 'id' || !op || op.t !== 'op' || ['=', '+=', '-='].indexOf(op.v) < 0) throw new Error('Expected "name = value", "name += n" or "name -= n"');
    var p = parseExprTokens(toks, i + 2), v = evalNode(p.node, out);
    out[name.v] = op.v === '=' ? v : op.v === '+=' ? (out[name.v] || 0) + v : (out[name.v] || 0) - v;
    i = p.next;
    if (toks[i] && !(toks[i].t === 'op' && (toks[i].v === ';' || toks[i].v === ','))) throw new Error('Expected ";" between effects');
  }
  return out;
}
function checkExpr(src, isEffect) { try { if (isEffect) applyEffects(src, {}); else evalExpr(src, {}); return null; } catch (e) { return e.message; } }
function choiceOpen(choice, vars) { try { return !!evalExpr(choice.if, vars); } catch (e) { return false; } }
/* "{trust}" in passage text shows the variable; "{if hasKey}...{/if}" shows a block conditionally. */
function renderText(text, vars) {
  return String(text).replace(/\{if ([^}]+)\}([\s\S]*?)\{\/if\}/g, function (_, cond, body) { try { return evalExpr(cond, vars) ? body : ''; } catch (e) { return body; } })
    .replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, function (m, name) { return name in vars ? String(vars[name]) : m; });
}
function usedVariables(story) {
  var names = {};
  Object.keys(story.nodes).forEach(function (id) {
    story.nodes[id].choices.forEach(function (c) { [c.if, c.set].forEach(function (src) { try { tokenizeExpr(src || '').forEach(function (t) { if (t.t === 'id') names[t.v] = 1; }); } catch (e) {} }); });
    (String(story.nodes[id].text).match(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g) || []).forEach(function (m) { names[m.slice(1, -1)] = 1; });
  });
  return Object.keys(names).sort();
}

/* ---------- exploration ---------- */
/* Breadth-first over (passage, variables) states. Reports what a reader can actually reach. */
function explore(story, limit) {
  limit = limit || 5000;
  var key = function (id, v) { return id + '|' + JSON.stringify(v, Object.keys(v).sort()); };
  var start = { id: story.root, vars: Object.assign({}, story.vars || {}), depth: 1 };
  var queue = [start], seen = {}, reached = {}, endings = {}, dead = {}, usedChoice = {}, states = 0, maxDepth = 0, truncated = false;
  seen[key(start.id, start.vars)] = 1;
  while (queue.length) {
    if (states >= limit) { truncated = true; break; }
    var s = queue.shift(), n = story.nodes[s.id];
    states++;
    if (!n) continue;
    reached[s.id] = (reached[s.id] || 0) + 1;
    maxDepth = Math.max(maxDepth, s.depth);
    if (n.ending) { endings[s.id] = (endings[s.id] || 0) + 1; continue; }
    var open = n.choices.map(function (c, i) { return { c: c, i: i }; }).filter(function (x) { return x.c.to && story.nodes[x.c.to] && choiceOpen(x.c, s.vars); });
    if (!open.length) dead[s.id] = (dead[s.id] || 0) + 1;
    open.forEach(function (x) {
      usedChoice[s.id + ':' + x.i] = 1;
      var v; try { v = applyEffects(x.c.set, s.vars); } catch (e) { v = s.vars; }
      var k = key(x.c.to, v);
      if (!seen[k]) { seen[k] = 1; queue.push({ id: x.c.to, vars: v, depth: s.depth + 1 }); }
    });
  }
  var neverOpen = [];
  Object.keys(story.nodes).forEach(function (id) { if (!reached[id]) return; story.nodes[id].choices.forEach(function (c, i) { if (c.to && story.nodes[c.to] && !usedChoice[id + ':' + i]) neverOpen.push({ id: id, index: i, label: c.label }); }); });
  return { states: states, truncated: truncated, reached: Object.keys(reached), unreachable: Object.keys(story.nodes).filter(function (id) { return !reached[id]; }), endings: endings, deadEnds: Object.keys(dead), neverOpen: neverOpen, maxDepth: maxDepth };
}

/* ---------- exporters ---------- */
function passageNames(story) {
  var names = {}, used = {};
  Object.keys(story.nodes).forEach(function (id) { var n = story.nodes[id], nm = String(n.title).replace(/[[\]{}|<>]/g, '').trim() || id; if (used[nm]) nm += ' ' + id; used[nm] = 1; names[id] = nm; });
  return names;
}
/* Twee 3 for Twine 2 (Harlowe): variables become (set:) macros and conditions become (if:) hooks. */
function harloweExpr(src) {
  var ops = { '&&': 'and', '||': 'or', '!': 'not', '==': 'is', '!=': 'is not' };
  return tokenizeExpr(src).map(function (t) { return t.t === 'id' ? '$' + t.v : t.t === 'str' ? JSON.stringify(t.v) : t.t === 'op' ? ops[t.v] || t.v : String(t.v); }).join(' ').replace(/\( /g, '(').replace(/ \)/g, ')');
}
/* One effect statement, e.g. "trust += 1" -> "$trust to it + 1". */
function harloweSet(stmt) {
  var m = String(stmt).match(/^\s*([A-Za-z_]\w*)\s*(\+=|-=|=)\s*([\s\S]+)$/);
  if (!m) return '';
  return '$' + m[1] + ' to ' + (m[2] === '+=' ? 'it + ' : m[2] === '-=' ? 'it - ' : '') + harloweExpr(m[3]);
}
function toTwee(story, ifid) {
  var names = passageNames(story);
  var out = ':: StoryTitle\n' + (story.title || 'Untitled') + '\n\n:: StoryData\n' + JSON.stringify({ ifid: ifid, format: 'Harlowe', 'format-version': '3.3.8', start: names[story.root] }, null, 2) + '\n\n';
  var init = Object.keys(story.vars || {}).map(function (k) { return '(set: $' + k + ' to ' + JSON.stringify(story.vars[k]) + ')'; }).join('');
  Object.keys(story.nodes).forEach(function (id) {
    var n = story.nodes[id];
    var body = n.text.replace(/\{if ([^}]+)\}([\s\S]*?)\{\/if\}/g, function (_, c, b) { return '(if: ' + harloweExpr(c) + ')[' + b + ']'; }).replace(/\{([A-Za-z_]\w*)\}/g, '$$$1');
    var links = n.choices.filter(function (c) { return c.to && story.nodes[c.to]; }).map(function (c) {
      var label = c.label.replace(/[[\]]/g, ''), link = c.set ? '(link: "' + label.replace(/"/g, "'") + '")[(set: ' + String(c.set).split(/[;,]/).filter(function (x) { return x.trim(); }).map(harloweSet).join(', ') + ')(go-to: "' + names[c.to] + '")]' : '[[' + label + '->' + names[c.to] + ']]';
      return c.if ? '(if: ' + harloweExpr(c.if) + ')[' + link + ']' : link;
    });
    out += ':: ' + names[id] + '\n' + (id === story.root && init ? init + '\n' : '') + body + '\n\n' + links.join('\n') + '\n\n';
  });
  return out;
}
/* One self-contained HTML file that plays the story in any browser. */
function toStandaloneHTML(story) {
  var data = JSON.stringify({ title: story.title, root: story.root, vars: story.vars || {}, nodes: story.nodes }).replace(/</g, '\\u003c');
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var engine = [tokenizeExpr, parseExprTokens, evalNode, evalExpr, applyEffects, choiceOpen, renderText].map(String).join('\n');
  return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + esc(story.title || 'Story') + '</title>\n<style>body{margin:0;background:#faf8f5;color:#222;font:20px/1.75 Georgia,serif}main{max-width:660px;margin:0 auto;padding:48px 20px}h1{font-size:15px;font-family:system-ui,sans-serif;color:#888;font-weight:600}h2{font-size:28px}button{display:block;width:100%;text-align:left;margin:10px 0;padding:12px 16px;font:16px system-ui,sans-serif;border:1px solid #ccc;border-radius:10px;background:#fff;cursor:pointer}button:hover{border-color:#9333ea}.end{font:600 14px system-ui,sans-serif;color:#9333ea}@media(prefers-color-scheme:dark){body{background:#151515;color:#eee}button{background:#222;color:#eee;border-color:#444}}</style></head>\n<body><main id="app"></main>\n<script>\nvar STORY = ' + data + ';\n' + engine + '\nvar vars = Object.assign({}, STORY.vars), app = document.getElementById("app");\nfunction show(id) {\n  var n = STORY.nodes[id], h = "<h1>" + (STORY.title || "") + "</h1><h2></h2>";\n  app.innerHTML = h;\n  app.querySelector("h2").textContent = n.title;\n  renderText(n.text, vars).split(/\\n+/).forEach(function (p) { var e = document.createElement("p"); e.textContent = p; app.appendChild(e); });\n  if (n.ending) { var d = document.createElement("p"); d.className = "end"; d.textContent = "The end"; app.appendChild(d); var b = document.createElement("button"); b.textContent = "Start again"; b.onclick = function () { vars = Object.assign({}, STORY.vars); show(STORY.root); }; app.appendChild(b); return; }\n  n.choices.forEach(function (c) { if (!c.to || !STORY.nodes[c.to] || !choiceOpen(c, vars)) return; var b = document.createElement("button"); b.textContent = c.label; b.onclick = function () { try { vars = applyEffects(c.set, vars); } catch (e) {} show(c.to); window.scrollTo(0, 0); }; app.appendChild(b); });\n}\nshow(STORY.root);\n</script></body></html>\n';
}

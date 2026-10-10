const STORY = () => ({
  title: 'Door </script>', root: 'a', vars: { hasKey: false, visits: 0 },
  nodes: {
    a: { id: 'a', title: 'A', text: 'Start.', choices: [{ label: 'Take key', to: 'b', set: 'hasKey = true' }, { label: 'Leave', to: 'c' }] },
    b: { id: 'b', title: 'B', text: 'Key {hasKey}.', choices: [{ label: 'Back', to: 'a', set: 'visits = 1' }, { label: 'Open door', to: 'd', if: 'hasKey' }, { label: 'Fly', to: 'd', if: 'wings' }] },
    c: { id: 'c', title: 'C', text: 'Hall.', choices: [{ label: 'Open door', to: 'd', if: 'hasKey && visits >= 1' }] },
    d: { id: 'd', title: 'D', text: 'Out.', ending: true, choices: [] },
    e: { id: 'e', title: 'E', text: 'Lost.', ending: true, choices: [] },
  },
});

test('graph helpers: paths, stats and layout', () => {
  const s = STORY();
  assert.deepEq(pathTo(s, 'd'), ['a', 'b', 'd']);
  const st = storyStats(s);
  assert.deepEq([st.passages, st.endings, st.open, st.unreachable], [5, 2, 0, ['e']]);
  assert.eq(st.longest, 3);
  const pos = layoutGraph(s);
  assert.eq(pos.a.x, 0); assert.eq(pos.d.x, 480);
  assert.ok(pos.e.x > pos.d.x, 'unreachable passages go last');
});

test('evalExpr handles arithmetic, comparison, boolean logic and strings', () => {
  assert.eq(evalExpr('2 + 3 * 4'), 14);
  assert.eq(evalExpr('(2+3)*4'), 20);
  assert.eq(evalExpr('a >= 2 && !b', { a: 2, b: false }), true);
  assert.eq(evalExpr('name == "Ana" or x', { name: 'Ana' }), true);
  assert.eq(evalExpr('missing + 1'), 1);
  assert.eq(evalExpr('-x + 1', { x: 2 }), -1);
  assert.eq(evalExpr('not done', {}), true);
  assert.eq(evalExpr(''), true);
  assert.throws(() => evalExpr('2 +'));
  assert.throws(() => evalExpr('2 2'));
  assert.throws(() => evalExpr('#'));
});

test('applyEffects assigns and increments variables', () => {
  assert.deepEq(applyEffects('trust += 2; met = true, name = "Bo"', { trust: 1 }), { trust: 3, met: true, name: 'Bo' });
  assert.deepEq(applyEffects('x -= 1', {}), { x: -1 });
  assert.deepEq(applyEffects('', { a: 1 }), { a: 1 });
  assert.throws(() => applyEffects('x', {}));
  assert.eq(checkExpr('a >', false) !== null, true);
  assert.eq(checkExpr('a = 1; b += a', true), null);
  assert.ok(!choiceOpen({ if: 'broken &&' }, {}), 'invalid conditions keep a choice closed');
});

test('renderText interpolates variables and conditional blocks', () => {
  assert.eq(renderText('Hi {name}.{if met} Again.{/if} {missing}', { name: 'Ana', met: true }), 'Hi Ana. Again. {missing}');
  assert.eq(renderText('{if met}Seen{/if}', { met: false }), '');
  assert.deepEq(usedVariables(STORY()), ['hasKey', 'visits', 'wings']);
});

test('explore walks the variable state space', () => {
  const r = explore(STORY());
  assert.ok(!r.truncated);
  assert.deepEq(r.reached.sort(), ['a', 'b', 'c', 'd']);
  assert.deepEq(r.unreachable, ['e']);
  assert.deepEq(Object.keys(r.endings), ['d']);
  assert.deepEq(r.deadEnds, ['c'], 'the hall without the key is a dead end');
  assert.deepEq(r.neverOpen.map((x) => x.label), ['Fly']);
  const loop = STORY();
  loop.nodes.b.choices[0].set = 'visits += 1';
  assert.ok(explore(loop, 200).truncated, 'unbounded counters are capped');
});

test('Twee export maps variables to Harlowe macros', () => {
  assert.eq(harloweExpr('hasKey && visits >= 1'), '$hasKey and $visits >= 1');
  assert.eq(harloweExpr('!(a == "x")'), 'not ($a is "x")');
  assert.eq(harloweSet('trust += 2'), '$trust to it + 2');
  assert.eq(harloweSet('visits = 1'), '$visits to 1');
  const tw = toTwee(STORY(), 'ABC');
  assert.ok(tw.includes(':: A\n(set: $hasKey to false)(set: $visits to 0)\nStart.'));
  assert.ok(tw.includes('(link: "Take key")[(set: $hasKey to true)(go-to: "B")]'));
  assert.ok(tw.includes('(if: $hasKey)[[[Open door->D]]]'));
  assert.ok(tw.includes('Key $hasKey.'));
  assert.ok(tw.includes('"start": "A"'));
});

test('standalone HTML embeds the story and the engine safely', () => {
  const html = toStandaloneHTML(STORY());
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('<title>Door &lt;/script&gt;</title>'));
  assert.ok(html.includes('\\u003c/script>'), 'story data cannot close the script tag');
  assert.ok(html.includes('function applyEffects'));
  assert.eq((html.match(/<\/script>/g) || []).length, 1, 'only one closing script tag');
});

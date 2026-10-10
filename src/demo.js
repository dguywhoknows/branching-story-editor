/* A hand-written sample story that uses variables, plus canned passages used without a model provider. */
var SAMPLE_STORY = {
  title: 'The Keeper’s Letter',
  premise: 'A lighthouse keeper on a remote island finds a message in a bottle addressed to her, dated 40 years in the future.',
  genre: 'mystery',
  root: 'p1',
  vars: { courage: 0, readTwice: false, radioed: false },
  nodes: {
    p1: { id: 'p1', title: 'The Bottle', text: 'The storm has finally blown itself out, and the beach below the lighthouse glitters with wreckage: kelp, rope, a broken crate. Then you see it, a green bottle wedged between two rocks, its cork sealed with red wax.\n\nInside, the paper is crisp and dry. It is addressed to you, by name, in handwriting you almost recognize. The date at the top reads forty years from today.\n\n"Don’t light the lamp on the night of the new moon," it says. "Whatever you see out there, don’t."\n\nThe new moon is tomorrow.', ending: false, choices: [
      { label: 'Read the letter again by lamplight', to: 'p2', set: 'readTwice = true; courage += 1' },
      { label: 'Radio the mainland coast guard', to: 'p3', set: 'radioed = true' },
      { label: 'Climb to the lantern room', to: 'p4', set: 'courage += 1' },
    ] },
    p2: { id: 'p2', title: 'Lamplight', text: 'Under the lamp, a second line appears below the first, written in ink so faint it could be a watermark: "You will want to save them. You can’t."\n\nThe handwriting is yours. You are sure of it now.', ending: false, choices: [
      { label: 'Climb to the lantern room', to: 'p4', set: 'courage += 1' },
      { label: 'Radio the mainland', to: 'p3', set: 'radioed = true' },
    ] },
    p3: { id: 'p3', title: 'Static', text: 'The radio hisses. Between bursts of static, a voice reads out a list of ship names, one after another, calm as a weather report. None of them are ships you know.{if readTwice}\n\nOne of them is the name in the faint second line of the letter.{/if}', ending: false, choices: [
      { label: 'Write down the names', to: 'p4', set: 'courage += 1' },
      { label: 'Switch the radio off and wait for dawn', to: 'p6' },
    ] },
    p4: { id: 'p4', title: 'The Lantern Room', text: 'The lamp sits cold behind its lens. Far out on the water, a light blinks back at you: three short, three long, three short. Courage: {courage}.', ending: false, choices: [
      { label: 'Light the lamp anyway', to: 'p5', if: 'courage >= 2' },
      { label: 'Leave the lamp dark', to: 'p6' },
      { label: 'Signal back with a hand torch', to: 'p7', if: 'radioed' },
    ] },
    p5: { id: 'p5', title: 'Beacon', text: 'The beam sweeps out over the water and catches the hull of a ship that should not be there, its paint forty years too new. For a moment every porthole is lit. Then the sea is empty, and on the desk behind you lies a second bottle, still wet.', ending: true, choices: [] },
    p6: { id: 'p6', title: 'Dark Water', text: 'You keep the lamp dark. At dawn the sea is flat and silver. The letter in your pocket is blank now, as if whatever it warned about has been prevented. Or has already happened.', ending: true, choices: [] },
    p7: { id: 'p7', title: 'Answer', text: 'You flash the torch: three short, three long, three short. The distant light stops. A minute later the radio crackles with a single word, in your own voice: "Thank you."', ending: true, choices: [] },
  },
};
var DEMO_OPEN = { story_title: SAMPLE_STORY.title, title: 'The Bottle', text: SAMPLE_STORY.nodes.p1.text, choices: ['Read the letter again by lamplight', 'Search the beach for more bottles', 'Radio the mainland coast guard'] };
var DEMO_BEATS = ['A cold wind rattles the lantern room windows.', 'Far out on the water, a light blinks back, three short, three long.', 'The logbook falls open to a page you never wrote.', 'Somewhere below, the old foghorn groans although no one touched it.', 'Your own handwriting stares back at you from the margin.'];
function demoNext(choice, depth) {
  var end = depth >= 4;
  return {
    title: choice.label.charAt(0).toUpperCase() + choice.label.slice(1, 30),
    text: 'You decide to ' + choice.label.toLowerCase() + '. ' + DEMO_BEATS[depth % DEMO_BEATS.length] + ' ' + DEMO_BEATS[(depth + 2) % DEMO_BEATS.length] + '\n\n' + (end ? 'At dawn the sea is flat and silver. The letter in your pocket is blank now.' : 'The letter’s warning echoes in your head as the light outside begins to fade.'),
    ending: end,
    choices: end ? [] : ['Climb to the lantern room', 'Hide the letter in the logbook', 'Row out toward the blinking light'],
  };
}

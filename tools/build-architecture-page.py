"""Generate the visual architecture page from docs/ARCHITECTURE.md.

    python3 tools/build-architecture-page.py

Writes docs/architecture.html — the same eight diagrams as the markdown, laid
out as a page you look at rather than read. Run it after editing the markdown,
so the two stay in step: the diagram sources are lifted from there rather than
copied, which is what stops the picture and the prose saying different things.

The diagram sources are lifted straight out of the markdown so the two cannot
drift apart, and HTML-escaped: inside a <pre class="mermaid"> the browser parses
the block before Mermaid sees it, so an unescaped <br/> becomes a real element
and vanishes from textContent, taking the label's line break with it.
"""
import pathlib
import re
import html

md = pathlib.Path('docs/ARCHITECTURE.md').read_text(encoding='utf-8')
blocks = re.findall(r'```mermaid\n(.*?)```', md, re.S)
assert len(blocks) == 8, len(blocks)

INIT = (
    '%%{init: {"theme":"base","themeVariables":{'
    '"background":"#141024","primaryColor":"#1b1533","primaryTextColor":"#dfe6ff",'
    '"primaryBorderColor":"#3df2ff","lineColor":"#8a90bd","secondaryColor":"#2b1a4a",'
    '"tertiaryColor":"#1a2b4a",'
    '"clusterBkg":"#0d0a1c","clusterBorder":"#2f2857","titleColor":"#3df2ff",'
    '"edgeLabelBackground":"#0d0a1c","nodeTextColor":"#dfe6ff","textColor":"#dfe6ff",'
    '"labelColor":"#dfe6ff","actorBkg":"#1b1533","actorTextColor":"#dfe6ff",'
    '"actorBorder":"#3df2ff","actorLineColor":"#8a90bd","signalColor":"#dfe6ff",'
    '"signalTextColor":"#dfe6ff","noteBkgColor":"#2b1a4a","noteTextColor":"#dfe6ff",'
    '"noteBorderColor":"#ff3df0","labelBoxBkgColor":"#1b1533","labelBoxBorderColor":"#3df2ff",'
    '"labelTextColor":"#dfe6ff","loopTextColor":"#dfe6ff","altBackground":"#0d0a1c",'
    '"sequenceNumberColor":"#07060f","transitionColor":"#8a90bd",'
    '"stateBkg":"#1b1533","stateLabelColor":"#dfe6ff","compositeBackground":"#0d0a1c",'
    '"specialStateColor":"#b6ff3d"}} }%%\n'
)

SECTIONS = [
    {
        'n': '01', 'id': 'system', 'name': 'The whole system',
        'lead': 'Three moving parts, two of them optional.',
        'body': [
            'The game is a folder of files served over HTTP. It needs no server to play, '
            'and reaches out to exactly one place for exactly one reason: so a score you '
            'post is a score somebody else can see.',
            'With no Worker configured, the leaderboard screens say the board is '
            'unreachable and show nothing — rather than showing local numbers and calling '
            'them a leaderboard.',
        ],
        'note': ('What never crosses the line', 'Your handle, settings, archive and which '
                 'tournaments you were let into are all local. The Worker sees finished '
                 'runs, tournament rules, and in-progress runs while a lobby is live.'),
    },
    {
        'n': '02', 'id': 'layers', 'name': 'The layer stack',
        'lead': 'Dependencies point one way, top to bottom. No cycles.',
        'body': [
            'The rule that does the work: <em>game</em> calls into <em>ui</em> to show '
            'things; <em>ui</em> reads <code>game/state.js</code> but never the reverse. '
            '<code>game/execute.js</code> decides what happened and hands the view a '
            'symbolic source — <code>{type:\'artifact\', id}</code> — and the view is what '
            'knows an artifact\'s payout should fly out of that artifact\'s slot.',
            'No DOM code lives in the game layer, which is why the whole scoring pipeline '
            'can be reasoned about without a screen.',
        ],
        'note': ('data <em>is</em> the game', 'A die, an artifact, an ability, a boss and a '
                 'threat level are all catalog entries with optional hooks. The pipeline '
                 'never asks what something <em>is</em> — it asks whether it has an '
                 '<code>onScore</code>, a <code>lateMultiplier</code>, a <code>perDie</code>.'),
    },
    {
        'n': '03', 'id': 'run', 'name': 'A run, phase by phase',
        'lead': 'One value, checked everywhere.',
        'body': [
            '<code>run.phase</code> gates everything — which buttons are live, which keys '
            'do anything, what the music is doing. An animation can never leave the player '
            'able to press something mid-payload.',
            'A node is five of these loops. Node 5 of every server has a boss protocol on '
            'it; beat that and the server migrates.',
        ],
        'note': ('MANIP is the only phase the player really controls',
                 'Locking, rerolling and firing abilities happen there and nowhere else. '
                 'Everything around it is an animation playing out, or the game waiting for '
                 'one. <b>LEAK_WAIT</b> exists for a single artifact: MEMORY LEAK keeps '
                 'draining after the last Execute is spent, so a run out of attempts can '
                 'still have its firewall finished off by damage already in flight.'),
    },
    {
        'n': '04', 'id': 'execute', 'name': 'One Execute, end to end',
        'lead': 'The heart of the game. The order is the whole design.',
        'body': [
            '<b>Why flat-then-times, within a slot.</b> It makes a single artifact '
            'predictable: whatever it does, it finishes doing it before the next slot starts.',
            '<b>Why the order between slots is yours.</b> A <code>+Mult</code> artifact is '
            'only multiplied by the <code>×Mult</code> artifacts sitting to its <em>right</em>.',
        ],
        'note': ('The same rig, both ways round',
                 'BOTNET then QUANTUM CORE on five dice showing 4 is '
                 '<code>20 × ((1+5) × 2)</code> = <b>240</b>. Swap them and it is '
                 '<code>20 × ((1×2) + 5)</code> = <b>140</b>. You drag the row into order '
                 'yourself, and you can get it wrong — which is the point.'),
    },
    {
        'n': '05', 'id': 'state', 'name': 'Where state lives',
        'lead': 'Three places, decided by one question: who else needs to see it?',
        'body': [
            '<b>The archive is deliberately local.</b> It is a record of what you have '
            'played, not a score anyone competes on — so it never goes near the shared '
            'board, and two people on one machine share one archive. Being <em>offered</em> '
            'something in the market counts, bought or not.',
        ],
        'note': ('A score banks either way',
                 'Traced or walked away from, the run is submitted. Score is nodes breached, '
                 'servers owned and scrap harvested, multiplied by the threat level — '
                 'deliberately not hacking power, which grows exponentially and would make '
                 'one lucky build unbeatable forever.'),
    },
    {
        'n': '06', 'id': 'tournament', 'name': 'A tournament, host to lobby',
        'lead': 'The rules travel inside the code.',
        'body': [
            'A five-character op code, a QR and a long invite code all name the same '
            'tournament, because the whole rule set is packed into the code itself rather '
            'than looked up.',
        ],
        'note': ('You only see the ones you were let into',
                 'They all live on the shared board, but listing them all would be a '
                 'directory of other people\'s games. Knowing an op code <em>is</em> the '
                 'permission.'),
    },
    {
        'n': '07', 'id': 'av', 'name': 'Drawing and sound',
        'lead': 'Nothing is loaded. Every pixel and every sample is made at runtime.',
        'body': [
            'Sprites are cached by what they look like, not by what they are — so a die '
            'whose appearance changes as it wears says so in its cache key.',
            'The soundtrack is an eight-bar progression with seven melodic motifs stepping '
            'against it. Seven and eight being coprime, no bar repeats for fifty-six of them.',
        ],
        'note': ('The same piece, two ways',
                 'Layers switch in and out with intensity, so an ordinary node and its last '
                 'execute are the same music played differently — measured at +2.8 dB and '
                 '60% more hits per bar between the two.'),
    },
    {
        'n': '08', 'id': 'boot', 'name': 'Boot',
        'lead': 'Something has to be on screen before any of this exists.',
        'body': [
            'A wall of ES modules takes a moment to arrive, and a black screen reads as '
            'broken. The boot screen is inline — markup, CSS and script — so there is '
            'nothing to fetch before something is visible.',
        ],
        'note': ('Errors are shown, not swallowed',
                 'A deploy landing mid-session can leave a browser holding half the old '
                 'modules and half the new, which fails with a missing-export error. The '
                 'page says so and tells you to hard-refresh, rather than going black.'),
    },
]

nav = '\n'.join(
    f'      <a href="#{s["id"]}"><span class="rail-n">{s["n"]}</span>'
    f'<span class="rail-t">{s["name"]}</span></a>'
    for s in SECTIONS)

parts = []
for s, block in zip(SECTIONS, blocks):
    diagram = html.escape(INIT + block.rstrip(), quote=False)
    body = '\n'.join(f'        <p>{p}</p>' for p in s['body'])
    note_title, note_text = s['note']
    parts.append(f'''    <section class="stage" id="{s['id']}">
      <header class="stage-head">
        <span class="stage-n">{s['n']}</span>
        <div>
          <h2>{s['name']}</h2>
          <p class="lead">{s['lead']}</p>
        </div>
      </header>

      <figure class="screen">
        <figcaption>DIAGRAM {s['n']}</figcaption>
        <div class="scroller"><pre class="mermaid">{diagram}</pre></div>
      </figure>

      <div class="prose">
{body}
        <aside class="note">
          <h3>{note_title}</h3>
          <p>{note_text}</p>
        </aside>
      </div>
    </section>''')

TEMPLATE = pathlib.Path('tools/architecture-page.template.html').read_text(encoding='utf-8')

out = TEMPLATE.replace('<!--NAV-->', nav).replace('<!--STAGES-->', '\n\n'.join(parts))
pathlib.Path('docs/architecture.html').write_text(out, encoding='utf-8')
print(f'wrote docs/architecture.html: {len(out.splitlines())} lines, {len(blocks)} diagrams')

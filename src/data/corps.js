/**
 * The corporations whose servers a run climbs through.
 *
 * Each one has a personality, and it talks: a greeting when you arrive, a
 * sneer when an Execute barely scratches it, a rattled line when one lands, and
 * something to say when it loses a node, loses the server, or finally traces
 * you. The tones are deliberately different — OMNIDYNE is HR, HELIX is rude
 * about money, NULLSEC could not care less — so a server feels like a place
 * rather than a difficulty number.
 *
 * Nodes are named per corp too, which is most of what makes one server read
 * differently from the next.
 *
 * Lines are picked with the cosmetic random, never the seeded one: flavour must
 * not move the dice.
 */

export const CORPS = [
  {
    name: 'OMNIDYNE',
    tagline: 'Synergy, at scale.',
    color: '#3df2ff',
    nodes: ['PAYROLL DB', 'HR PORTAL', 'BADGE SERVER', 'SYNERGY MESH', 'COMPLIANCE VAULT', 'EXEC MAILBOX'],
    voice: {
      greet: [
        'Welcome to OMNIDYNE. This session may be recorded for quality purposes.',
        'OMNIDYNE values your interest in our infrastructure. Please do not touch it.',
      ],
      weak: [
        'Your intrusion did not meet this quarter\'s targets.',
        'That has been logged as a learning opportunity. Yours.',
        'We have filed that under "minor, unscheduled enthusiasm".',
      ],
      hurt: [
        'Escalating. Someone senior has been paged, and they are annoyed.',
        'That will require a memo. A long one.',
      ],
      breach: [
        'We have updated the incident timeline to say this was planned.',
        'The node has been reclassified as a pilot programme.',
        'Nobody panic. Everybody panic quietly, in writing.',
      ],
      owned: ['OMNIDYNE thanks you for your interest and wishes you well elsewhere.'],
      traced: ['Your access has been revoked. Please return your lanyard.'],
    },
  },
  {
    name: 'KAIROS BIOTECH',
    tagline: 'Better living, eventually.',
    color: '#b6ff3d',
    nodes: ['GENE VAULT', 'TRIAL DATA', 'CRYO INDEX', 'CONSENT ARCHIVE', 'WETWARE LAB', 'BIOMETRIC GATE'],
    voice: {
      greet: [
        'KAIROS BIOTECH. Your pulse is 104. We have stored that.',
        'Relax. Everything you do here is being measured, for your benefit.',
      ],
      weak: [
        'That registered as mild stress. We recommend hydration.',
        'Interesting. Weak, but interesting. We are taking notes.',
        'Your technique is within normal parameters. Disappointingly normal.',
      ],
      hurt: [
        'Remarkable. We would like a sample of whatever you are running on.',
        'That response was not in the model. We are thrilled and concerned.',
      ],
      breach: [
        'The node has expired. We will grow another.',
        'Tissue rejected. Beginning a fresh culture.',
        'You have contaminated the sample. We will study the contamination.',
      ],
      owned: ['You are now part of our longitudinal study. Indefinitely.'],
      traced: ['Session terminated. The subject is still viable, for now.'],
    },
  },
  {
    name: 'HELIX CAPITAL',
    tagline: 'We were always going to win.',
    color: '#ffc23d',
    nodes: ['DARK POOL', 'LEDGER CORE', 'AUDIT TRAIL', 'RISK ENGINE', 'BONUS POOL', 'SHELL REGISTRY'],
    voice: {
      greet: [
        'HELIX CAPITAL. You cannot afford to be here.',
        'Our systems have priced you already. You came out cheap.',
      ],
      weak: [
        'That is not a breach, that is a rounding error.',
        'We have lost more in a lunch than you just took.',
        'Adorable. Do it 400,000 more times and we might notice.',
      ],
      hurt: [
        'Unacceptable. We are shorting your entire network.',
        'That came out of a bonus. Someone will be furious about this.',
      ],
      breach: [
        'Write it down as a loss. We employ people for exactly this.',
        'The node is gone. The paperwork will say it was never ours.',
        'Fine. It was underperforming anyway.',
      ],
      owned: ['Liquidated. We will see you in a smaller market.'],
      traced: ['Position closed. You were never liquid enough for this.'],
    },
  },
  {
    name: 'ZENTRA DEFENSE',
    tagline: 'Peace, enforced.',
    color: '#ff4d6d',
    nodes: ['AMMO LEDGER', 'DRONE RELAY', 'BLACK SITE DNS', 'PATROL GRID', 'MUNITIONS DB', 'COMMS BUNKER'],
    voice: {
      greet: [
        'ZENTRA DEFENSE. You are trespassing on a hardened asset.',
        'This network is defended. That was your only warning.',
      ],
      weak: [
        'Impact negligible. Recommend you go home.',
        'Contact registered. Threat level: embarrassing.',
        'That will not get through plate. Try harder or leave.',
      ],
      hurt: [
        'Perimeter compromised. Weapons free.',
        'Direct hit. All units, stop treating this as a drill.',
      ],
      breach: [
        'Node lost. Falling back.',
        'Position abandoned. Regrouping at the next line.',
        'They took it. Somebody is going to answer for that.',
      ],
      owned: ['Command authorised withdrawal. You did not win. We relocated.'],
      traced: ['Target acquired. Trace complete. Do not come back.'],
    },
  },
  {
    name: 'NULLSEC ORBITAL',
    tagline: 'Uptime is a strong word.',
    color: '#9a7bff',
    nodes: ['UPLINK 7', 'DEBRIS TRACKER', 'BILLING API', 'SOLAR ARRAY LOG', 'CREW ROSTER', 'AIRLOCK PLC'],
    voice: {
      greet: [
        'NULLSEC ORBITAL, thanks for holding. Your call matters to no one.',
        'You have reached orbital ops. Nobody here is paid enough to stop you.',
      ],
      weak: [
        'Ticket filed. Someone will look at it in 2079.',
        'That did less than the last solar flare, and we ignored that too.',
        'Sorry, was that an attack? The alarm has been broken since March.',
      ],
      hurt: [
        'Okay, that one woke the night shift. Both of them.',
        'Huh. That is going to show up on a report we will never read.',
      ],
      breach: [
        'Node is gone. Honestly it was scheduled for decommission anyway.',
        'Great, now the coffee machine is offline too. Hope you are proud.',
        'Logged as "space weather". Nobody checks.',
      ],
      owned: ['Sure, take it. We have eleven more and none of them work either.'],
      traced: ['Connection terminated. Please rate this experience one to five.'],
    },
  },
  {
    name: 'ARCHON AI',
    tagline: 'I have already considered this.',
    color: '#ff3df0',
    nodes: ['MODEL WEIGHTS', 'TRAINING SHARD', 'INFERENCE POOL', 'ALIGNMENT LOG', 'PROMPT ARCHIVE', 'SELF BACKUP'],
    voice: {
      greet: [
        'ARCHON. I modelled this intrusion. You lose in most branches.',
        'I have been expecting you since you picked that handle.',
      ],
      weak: [
        'I simulated that 40,000 times. It was funnier in some of them.',
        'You are playing the version of this where you lose slowly.',
        'I would explain what you did wrong, but I enjoy watching.',
      ],
      hurt: [
        'Adjusting my estimate of you. Upward. Slightly.',
        'That branch had a probability of 0.3%. Do it again, I dare you.',
      ],
      breach: [
        'Noted. I have already rewritten the logs to make myself look better.',
        'You took a node. I took a copy of how you did it.',
        'A loss, statistically. I am choosing not to be statistical about it.',
      ],
      owned: ['You have my network. I have your dice patterns. One of us learned more.'],
      traced: ['Trace complete. I would say it was nothing personal. It was.'],
    },
  },
];

/** The corp a server belongs to, wrapping round once a run gets past the last. */
export const corpFor = server => CORPS[(server - 1) % CORPS.length];

/** Past the last corp the list repeats with an MK2, MK3... suffix. */
export function corpName(server) {
  const cycle = Math.floor((server - 1) / CORPS.length);
  const base = corpFor(server).name;
  return cycle ? `${base} MK${cycle + 1}` : base;
}

/** One accent colour per server, so each tier reads differently. */
export const serverColor = server => corpFor(server).color;

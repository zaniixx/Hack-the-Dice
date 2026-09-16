/**
 * Every element the UI touches, looked up once.
 *
 * Keeping the selectors in one file means index.html and the code that drives
 * it have exactly one contract, and a renamed id breaks in one place.
 */
const $ = selector => document.querySelector(selector);

export const els = {
  // Shell
  grid: $('#grid'),
  fx: $('#fx'),
  modal: $('#modal'),
  start: $('#start'),
  sheetBackdrop: $('#sheetBackdrop'),

  // Boss cutscene
  cutscene: $('#cutscene'),
  cutLabel: $('#cutLabel'),
  cutSprite: $('#cutSprite'),
  cutName: $('#cutName'),
  cutRule: $('#cutRule'),
  cutLine: $('#cutLine'),

  // First-run tutorial
  coach: $('#coach'),
  coachRing: $('#coachRing'),
  coachNote: $('#coachNote'),
  coachTitle: $('#coachTitle'),
  coachText: $('#coachText'),
  coachStep: $('#coachStep'),
  coachSkip: $('#coachSkip'),

  // Top bar
  handle: $('#tHandle'),
  tier: $('#tTier'),
  tournament: $('#tOp'),
  tournamentWrap: $('#tOpWrap'),
  server: $('#tServer'),
  corp: $('#tCorp'),
  node: $('#tNode'),
  scrap: $('#tScrap'),
  seed: $('#tSeed'),
  best: $('#tBest'),
  speedButton: $('#btnSpeed'),
  rigButton: $('#btnRig'),
  logButton: $('#btnLog'),
  fullscreenButton: $('#btnFull'),
  soundButton: $('#btnSound'),
  menuButton: $('#btnMenu'),

  // Target panel
  nodeName: $('#nodeName'),
  nodeTag: $('#nodeTag'),
  enemyCanvas: $('#enemy'),
  enemyOverlay: $('#eOverlay'),
  bossRule: $('#bossRule'),
  firewallText: $('#fwText'),
  firewallBar: $('#fwBar'),
  firewallGhost: $('#fwGhost'),
  firewallFill: $('#fwFill'),
  log: $('#log'),

  // Board panel
  artifactRow: $('#arts'),
  boardWrap: $('#boardWrap'),
  boardCanvas: $('#board'),
  combo: $('#combo'),
  hint: $('#hint'),
  bits: $('#bits'),
  mult: $('#mult'),
  power: $('#power'),
  executePips: $('#execPips'),
  rerollPips: $('#rerollPips'),
  rollButton: $('#btnRoll'),
  rerollButton: $('#btnReroll'),
  executeButton: $('#btnExec'),
  abilityBar: $('#abils'),

  // Toolkit panel
  toolkit: $('#toolkit'),
  shop: $('#shop'),
  shopRefreshButton: $('#btnShopReroll'),
  nextNodeButton: $('#btnNext'),
  diceCount: $('#diceCount'),
  diceInventory: $('#diceInv'),
  abilityCount: $('#abilCount'),
  abilityInventory: $('#abilInv'),
  artifactCount: $('#artCount'),
  artifactInventory: $('#artInv'),
};

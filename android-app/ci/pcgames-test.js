// Device test pass "pcgames" (beta.4), run by web-device-test.js. Checks results, never speed.
//   Node (main/pcgames.js on made-up folders): Epic's install list keeps installed games only (not the engine, plugins or
//   half-installed ones) and starts them through the launcher's link; Quiver 3 (apps.json beside its program) and Quiver 4
//   (installs.json + library.json) give each installed app its program and name; games added by hand whose program is
//   gone are left out; a saved config keeps only clean entries.
//   The demo page as Windows with ?pcx=1: the PC shelf has the Epic game, a Custom shelf has the Quiver recomp; Play on it
//   goes through launch:pc by id (and back to the shelf when it closes), the Epic game says it starts through Epic;
//   Settings → Custom games adds three programs with separate settings pages, edits one, and removes them (twice);
//   Settings → PC games has the Epic switch.
'use strict';
const path = require('path'), fs = require('fs'), os = require('os');

module.exports = async function pcGamesPass({ browser, base, check, newPage }) {
  const root = path.resolve(__dirname, '..', '..');
  try {
    const pcg = require(path.join(root, 'main', 'pcgames.js'));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-pc-'));
    const mk = (p, body) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };
    // Epic: a game, the engine, a plugin, a half-installed game, a game whose folder is gone
    const man = path.join(tmp, 'Manifests'), inst = path.join(tmp, 'Epic Games');
    mk(path.join(inst, 'Ember', 'Ember.exe'), 'MZ'); mk(path.join(inst, 'UE', 'x'), ''); mk(path.join(inst, 'Half', 'x'), '');
    const item = (f, o) => mk(path.join(man, f + '.item'), JSON.stringify(o));
    item('a', { DisplayName: 'Ember Trail', AppName: 'Ember', CatalogNamespace: 'ns1', CatalogItemId: 'it1', InstallLocation: path.join(inst, 'Ember'), LaunchExecutable: 'Ember.exe', AppCategories: ['public', 'games', 'applications'] });
    item('b', { DisplayName: 'Unreal Engine', AppName: 'UE_5.4', InstallLocation: path.join(inst, 'UE'), AppCategories: ['engines'] });
    item('c', { DisplayName: 'A Plugin', AppName: 'plug', InstallLocation: path.join(inst, 'UE'), AppCategories: ['plugins'] });
    item('d', { DisplayName: 'Half Done', AppName: 'Half', InstallLocation: path.join(inst, 'Half'), bIsIncompleteInstall: true, AppCategories: ['games'] });
    item('e', { DisplayName: 'Gone', AppName: 'Gone', InstallLocation: path.join(inst, 'Gone'), AppCategories: ['games'] });
    const epic = pcg.epicGames(man);
    check('PC games: Epic lists installed games only, started through the Epic launcher\'s link',
      epic.length === 1 && epic[0].title === 'Ember Trail' && epic[0].uri === 'com.epicgames.launcher://apps/ns1%3Ait1%3AEmber?action=launch&silent=true', JSON.stringify(epic));
    // Quiver 3 (portable): apps.json + settings.json beside its program, the games in Apps\<folder>; one listed app not installed
    const q3 = path.join(tmp, 'QuiverLauncher-win-Portable');
    mk(path.join(q3, 'QuiverLauncher.exe'), 'MZ');
    mk(path.join(q3, 'apps.json'), JSON.stringify({ apps: [{ name: 'Quarantine', folderName: 'Quarantine-Recomp', installPath: null, appIconUrl: 'https://cdn.example/icon.png', repository: 'acr/quarantine', tags: ['recomp'] }, { name: 'Not Installed', folderName: 'Nope', repository: 'x/nope' }] }));
    mk(path.join(q3, 'settings.json'), JSON.stringify({ AppsPath: '', UserAppDisplayNames: {} }));
    mk(path.join(q3, 'Apps', 'Quarantine-Recomp', 'Quarantine.exe'), 'MZ' + 'x'.repeat(5000)); mk(path.join(q3, 'Apps', 'Quarantine-Recomp', 'unins000.exe'), 'MZ' + 'x'.repeat(9000));
    const g3 = pcg.quiverGames(q3);
    check('PC games: Quiver 3 gives each installed app its program and name (not the uninstaller, not apps that aren\'t installed)',
      g3.length === 1 && g3[0].title === 'Quarantine' && /Quarantine\.exe$/.test(g3[0].exe) && g3[0].source === 'quiver', JSON.stringify(g3.map(g => ({ t: g.title, e: path.basename(g.exe) }))));
    // Quiver 4: installs.json + library.json (the player's own name wins)
    const q4 = path.join(tmp, 'q4');
    mk(path.join(q4, 'installs.json'), JSON.stringify({ 'github:a/ship': { version: '1', folder: 'Ship', executables: ['soh.exe'] } }));
    mk(path.join(q4, 'library.json'), JSON.stringify([{ id: 'github:a/ship', slug: 'ship', overrides: { name: 'Ship of Harkinian' } }]));
    mk(path.join(q4, 'apps', 'Ship', 'soh.exe'), 'MZ');
    const g4 = pcg.quiverGames(q4);
    check('PC games: Quiver 4 gives each install its program and the name the player chose',
      g4.length === 1 && g4[0].title === 'Ship of Harkinian' && /soh\.exe$/.test(g4[0].exe), JSON.stringify(g4.map(g => ({ t: g.title, e: path.basename(g.exe) }))));
    // games added by hand: a missing program is left out; the config keeps clean entries only
    const c = pcg.customGames([{ id: 'a', title: 'Mine', exe: path.join(q3, 'QuiverLauncher.exe'), platform: 'ps2' }, { id: 'b', title: 'Gone', exe: path.join(tmp, 'gone.exe') }]);
    const config = require(path.join(root, 'main', 'config.js'));
    const clean = config.normalize({ pc: { custom: [{ title: 'Ok', exe: 'C:\\x.exe', platform: 'ps2' }, { title: 'PC game', exe: 'C:\\y.exe', platform: 'pc', args: '-dx12' }, { title: 'Bad platform', exe: 'C:\\z.exe', platform: 'not-a-console' }, { title: 'No exe' }, 'junk'], epic: 'yes' } }).pc;
    const launcher = require(path.join(root, 'main', 'launcher.js'));
    const pcc = require(path.join(root, 'main', 'pccovers.js')), coverDir = path.join(tmp, 'pc-art');
    let lookedUp = '', sgEnabled = true;
    pcc.init({ dataDir: coverDir, steamgrid: { enabled: () => sgEnabled, posters: async g => { lookedUp = g.title; return [{ url: 'https://steamgriddb.com/poster.jpg', ext: '.jpg' }]; } }, fetchImage: async () => Buffer.from('poster image'), match: () => null, log: () => {} });
    const ownFile = path.join(tmp, 'picked.png'); fs.writeFileSync(ownFile, 'my selected art');
    await pcc.own('picked-art', ownFile);
    const artResult = await pcc.fillMissing([
      { id: 'quiver-art', title: 'A Recomp', source: 'quiver' },
      { id: 'picked-art', title: 'A Picked Cover', source: 'custom' },
      { id: 'existing-art', title: 'Already Covered', source: 'custom', art: { front: 'bsfile://existing.jpg' } },
    ]);
    sgEnabled = false;
    const noKey = await pcc.fillMissing([{ id: 'no-key', title: 'No Key', source: 'custom' }]);
    check('PC artwork: automatic SteamGridDB posters fill missing standalone-game art, but never replace a user choice or existing cover',
      artResult.checked === 1 && artResult.downloaded === 1 && lookedUp === 'A Recomp' && !!pcc.autoCover('quiver-art') &&
        fs.readFileSync(pcc.cover('picked-art'), 'utf8') === 'my selected art' && !pcc.autoCover('existing-art') &&
        noKey.checked === 0 && noKey.downloaded === 0, JSON.stringify({ artResult, noKey, lookedUp, downloaded: !!pcc.autoCover('quiver-art') }));
    fs.rmSync(tmp, { recursive: true, force: true });
    check('PC games: a hand-added game keeps its console assignment, missing files and unknown platforms are excluded',
      c.length === 1 && c[0].title === 'Mine' && c[0].platform === 'ps2' && clean.custom.length === 3 && clean.custom[0].exe === 'C:\\x.exe' && clean.custom[0].platform === 'ps2' && clean.custom[1].platform === 'pc' && clean.custom[1].args === '-dx12' && !clean.custom[2].platform && clean.epic === true, JSON.stringify({ c, clean }));
    check('PC games: Xbox One is a standalone platform and launch arguments split into executable arguments',
      require(path.join(root, 'main', 'systems.js')).CONSOLES.find(s => s.id === 'xboxone').standalone === true &&
        JSON.stringify(launcher.buildArgs('-dx12 --profile "Palworld World"', '')) === JSON.stringify(['-dx12', '--profile', 'Palworld World']), JSON.stringify(launcher.buildArgs('-dx12 --profile "Palworld World"', '')));
  } catch (e) { check('PC games: module checks ran', false, e && e.stack ? e.stack.split('\n').slice(0, 2).join(' ') : e); }

  const { ctx, page, errors } = await newPage(browser, null);
  try {
    await page.goto(base + '?platform=windows&shelf=1&pcx=1');
    await page.waitForFunction(() => window.Shelf && Shelf._qs && Shelf._qs().g && window.Setup, null, { timeout: 90000, polling: 250 });
    await page.waitForTimeout(1500);
    const sh = await page.evaluate(() => ({ counts: Shelf.gameCounts(), tabs: [...document.querySelectorAll('#tabs > *')].map(e => e.textContent.trim()) }));
    check('PC games (Windows): a Custom shelf (its own tab) holds the Quiver recomp; the PC shelf has one more game (Epic\'s)',
      sh.tabs.includes('Custom') && sh.counts.custom === 1 && sh.counts.pc >= 1, JSON.stringify(sh)); // (the demo has no Steam folder: PC holds Epic's game only)
    // to the Custom shelf (↓ walks the shelves), then Play: launch:pc by id, the launch screen, back to the shelf when it closes
    const play = await page.evaluate(async () => { const w = ms => new Promise(r => setTimeout(r, ms));
      const key = k => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
      const word = () => (document.getElementById('sysWord') || {}).textContent || '';
      for (let i = 0; i < 20 && !/Custom/i.test(word()); i++) { key('ArrowDown'); await w(500); }
      const out = { shelf: word(), game: Shelf._qs().g };
      key('i'); await w(900); out.how = ((document.getElementById('dDesc') || {}).textContent || '') + ' ' + ((document.getElementById('dHow') || {}).textContent || ''); out.chips = ((document.getElementById('dChips') || {}).textContent || ''); key('i'); await w(700);
      key('Enter'); await w(1500); out.mode = Shelf.getMode(); out.launched = (window.__pcLaunched || []).slice();
      for (let i = 0; i < 40 && Shelf.getMode() !== 'browse'; i++) await w(250); out.back = Shelf.getMode();
      // the PC shelf's Epic game: details say Epic, Play hands it to the Epic launcher by id, Back returns to the shelf
      for (let i = 0; i < 20 && !word().trim().startsWith('PC'); i++) { key('ArrowUp'); await w(500); } // (the word carries its tagline)
      for (let i = 0; i < 10 && Shelf._qs().g !== 'Ember Trail'; i++) { key('ArrowRight'); await w(350); }
      out.epic = { shelf: word(), game: Shelf._qs().g };
      if (out.epic.game !== 'Ember Trail') return out; // never Play some other game
      key('i'); await w(900); out.epic.how = ((document.getElementById('dDesc') || {}).textContent || '') + ' ' + ((document.getElementById('dHow') || {}).textContent || ''); out.epic.chips = ((document.getElementById('dChips') || {}).textContent || ''); key('i'); await w(700);
      key('Enter'); await w(1600); out.epic.launched = (window.__pcLaunched || []).includes('epic-ember-trail'); out.epic.mode = Shelf.getMode();
      key('Escape'); for (let i = 0; i < 20 && Shelf.getMode() !== 'browse'; i++) await w(250); out.epic.back = Shelf.getMode(); return out; });
    check('PC games (Windows): the Epic game on the PC shelf says it starts through Epic, Play hands it over by id, Back returns',
      play.epic.game === 'Ember Trail' && /Epic/.test(play.epic.how) && /Epic Games/.test(play.epic.chips) && play.epic.launched && play.epic.back === 'browse', JSON.stringify(play.epic));
    check('PC games (Windows): Play on a Custom shelf game starts it by id (launch:pc) and the shelf comes back when it closes',
      /Custom/i.test(play.shelf) && play.game === 'Quarantine' && play.launched.includes('quiver-quarantine') && play.mode === 'launch' && play.back === 'browse', JSON.stringify(play));
    check('PC games (Windows): a Quiver game says where it came from (no Steam wording)', /Quiver/.test(play.how + play.chips) && !/Steam/.test(play.how), JSON.stringify({ how: play.how, chips: play.chips }));
    // Settings → Custom games: add a program (named from its file), rename it, remove it (twice); PC games has the Epic switch
    const st = await page.evaluate(async () => { const w = ms => new Promise(r => setTimeout(r, ms)), out = {}, key = k => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
      const names = () => [...document.querySelectorAll('#bss .bss-row .nm')].map(e => e.textContent);
      const row = n => [...document.querySelectorAll('#bss .bss-row')].find(r => ((r.querySelector('.nm') || {}).textContent || '') === n);
      const cfg = async () => (await window.boxshelf.getConfig()).config.pc || {};
      for (let i = 0; i < 40 && Shelf.getMode() !== 'browse'; i++) await w(250); // (Settings opens from the shelf only)
      Setup.open({ page: 'pc' }); for (let i = 0; i < 40 && !document.querySelector('#bss.on .bss-row'); i++) await w(150); await w(600);
      out.pcPage = names();
      if (window.Settings && Settings.isOpen && Settings.isOpen()) { await Settings.close(); await w(800); }
      Setup.open({ page: 'custom' }); for (let i = 0; i < 40 && !row('Add a game'); i++) await w(150); await w(800);
      out.page = names(); out.quiverRow = (row('Quiver Launcher') || {}).textContent || '';
      row('Add a game').click(); await w(1200); row('Add a game').click(); await w(700); row('Add a game').click(); await w(700);
      out.added = (await cfg()).custom; out.after = names();
      const firstGame = row('program'); if (firstGame) { firstGame.click(); await w(700); }
      out.gameSettings = names();
      const platform = row('Platform'); if (platform) { platform.click(); key('ArrowRight'); await w(500); }
      const argRow = row('Launch arguments'); if (argRow) { argRow.click(); await w(150); const input = document.querySelector('.bss-edit'); if (input) { input.value = '-dx12'; input.dispatchEvent(new Event('input', { bubbles: true })); key('Enter'); }
        else { for (const ch of '-dx12') { const k=[...document.querySelectorAll('.bss-key')].find(x=>x.textContent===ch); if(k)k.click(); await w(100); } const done=[...document.querySelectorAll('.bss-key')].find(x=>x.textContent==='Done'); if(done)done.click(); } await w(700); }
      out.assigned = ((await cfg()).custom || [])[0] && (await cfg()).custom[0].platform || '';
      out.args = ((await cfg()).custom || [])[0] && (await cfg()).custom[0].args || '';
      key('Escape'); await w(500);
      const secondGame = row('program2'); if (secondGame) { secondGame.click(); await w(700); }
      out.secondSettings = names(); out.secondGame = ((await cfg()).custom || [])[1] || null;
      key('Escape'); await w(500);
      if (window.Settings && Settings.isOpen && Settings.isOpen()) { await Settings.close(); await w(1500); }
      const word = () => (document.getElementById('sysWord') || {}).textContent || '';
      for (let i = 0; i < 30 && !/^PC/.test(word().trim()); i++) { key('ArrowDown'); await w(250); }
      for (let i = 0; i < 20 && Shelf._qs().g !== 'program'; i++) { key('ArrowRight'); await w(250); }
      out.platformShelf = word(); out.platformGame = Shelf._qs().g;
      if (out.platformGame === 'program') { key('i'); await w(500); out.command = (document.getElementById('dCmd')||{}).textContent||''; key('i'); await w(300); key('Enter'); await w(1400); out.platformLaunch = (window.__pcLaunched || []).includes('custom-'+((await cfg()).custom[0]||{}).id); out.launchArgs=(window.__pcLaunches||[]).slice(-1)[0]||null; }
      for (let i = 0; i < 30 && Shelf.getMode() !== 'browse'; i++) await w(250);
      Setup.open({ page: 'custom' }); for (let i = 0; i < 40 && !row('program'); i++) await w(150); await w(500);
      const firstAgain=row('program'); if(firstAgain)firstAgain.click(); await w(700);
      const platformAgain=row('Platform'); if(platformAgain){platformAgain.click();for(let i=0;i<20&&(((await cfg()).custom||[])[0]||{}).platform!=='xboxone';i++){key('ArrowRight');await w(200)}}
      out.xboxAssigned=((await cfg()).custom||[])[0]&&((await cfg()).custom||[])[0].platform||'';
      if (window.Settings && Settings.isOpen && Settings.isOpen()) { await Settings.close(); await w(1200); }
      const xboxTab=[...document.querySelectorAll('#tabs .tab')].find(t=>t.textContent.trim()==='Xbox One');if(xboxTab){xboxTab.click();await w(1400)}
      for(let i=0;i<20&&Shelf._qs().g!=='program';i++){key('ArrowRight');await w(250)}
      out.xboxShelf=word();out.xboxGame=Shelf._qs().g;
      if(out.xboxGame==='program'){key('Enter');await w(1400);out.xboxLaunch=(window.__pcLaunches||[]).slice(-1)[0]||null}
      for(let i=0;i<30&&Shelf.getMode()!=='browse';i++)await w(250);
      Setup.open({ page: 'custom' }); for (let i = 0; i < 40 && !row('Add a game'); i++) await w(150); await w(500);
      for (const game of ['program','program2','program3']) { const entry=row(game); if(entry){entry.click();await w(500);const rm=row('Remove game');if(rm){rm.click();await w(300);rm.click();await w(700)}} }
      out.removed = (await cfg()).custom;
      if (window.Settings && Settings.isOpen && Settings.isOpen()) { await Settings.close(); await w(800); } return out; });
    check('PC games (Windows): Settings → PC games has the Epic switch; Custom games has Quiver and Add a game',
      st.pcPage.includes('Show installed Epic Games') && st.page.includes("Show Quiver's games") && st.page.includes('Add a game') && /Found/.test(st.quiverRow), JSON.stringify({ pc: st.pcPage, page: st.page, q: st.quiverRow }).slice(0, 500));
    check('PC games (Windows): each custom executable has its own settings page; name, arguments and platform are not mixed into the game list',
      (st.added || []).length === 3 && st.after.includes('program') && st.after.includes('program2') && st.after.includes('program3') &&
        !st.after.includes('Launch arguments') && !st.after.includes('Platform') && st.gameSettings.includes('Game name') &&
        st.gameSettings.includes('Launch arguments') && st.gameSettings.includes('Platform') && st.gameSettings.includes('Remove game') &&
        st.secondSettings.includes('Game name') && st.secondSettings.includes('Platform') && st.secondGame && !st.secondGame.args && !st.secondGame.platform,
      JSON.stringify({ added: st.added, list: st.after, first: st.gameSettings, second: st.secondSettings, secondGame: st.secondGame }).slice(0, 700));
    check('PC games (Windows): Remove from a game settings page (confirmed twice) takes only that game off the list',
      (st.removed || []).length === 0, JSON.stringify(st.removed));
    check('PC games (Windows): a standalone executable can be assigned to PC with editable arguments, displayed as its command and launched with those arguments',
      st.assigned === 'pc' && st.args === '-dx12' && /^PC/.test(st.platformShelf.trim()) && st.platformGame === 'program' && /program\.exe.*-dx12/.test(st.command) && st.platformLaunch && st.launchArgs && st.launchArgs.args === '-dx12', JSON.stringify({ assigned: st.assigned, args: st.args, shelf: st.platformShelf, game: st.platformGame, command: st.command, launch: st.launchArgs }));
    check('PC games (Windows): Xbox One has a standalone shelf and starts assigned executables without an emulator',
      st.xboxAssigned === 'xboxone' && /Xbox One/.test(st.xboxShelf) && st.xboxGame === 'program' && st.xboxLaunch && st.xboxLaunch.platform === 'xboxone' && st.xboxLaunch.args === '-dx12', JSON.stringify({ assigned: st.xboxAssigned, shelf: st.xboxShelf, game: st.xboxGame, launch: st.xboxLaunch }));
    // (beta.5) a PC game's cover picker: Details → Box art opens it with the options (SteamGridDB's, a picture of yours);
    // the arrows move, A uses one (by key), the picker closes and the shelf says so; opened again, Automatic cover is offered
    const cv = await page.evaluate(async () => { const w = ms => new Promise(r => setTimeout(r, ms));
      const key = k => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
      for (let i = 0; i < 40 && Shelf.getMode() !== 'browse'; i++) await w(250);
      const word = () => (document.getElementById('sysWord') || {}).textContent || '';
      for (let i = 0; i < 20 && !/^Custom/.test(word().trim()); i++) { key('ArrowDown'); await w(500); }
      const out = { game: Shelf._qs().g };
      key('i'); await w(900); const btn = document.getElementById('dBoxArt'); out.button = !!btn && !btn.hidden; if (btn) btn.click(); await w(900);
      const tiles = () => [...document.querySelectorAll('.coverpick .cp-tile')].map(t => t.textContent.trim());
      out.mode = Shelf.getMode(); out.tiles = tiles(); out.note = ((document.querySelector('.coverpick .cp-note') || {}).textContent || '');
      out.at = ((document.querySelector('.coverpick .cp-tile.on') || {}).textContent || '').trim();
      key('ArrowRight'); await w(200); out.moved = ((document.querySelector('.coverpick .cp-tile.on') || {}).textContent || '').trim();
      key('Enter'); await w(900); out.used = Object.assign({}, window.__pcCovers || {}); out.after = Shelf.getMode(); out.toast = ((document.getElementById('toast') || {}).textContent || '');
      key('i'); await w(900); const b2 = document.getElementById('dBoxArt'); if (b2) b2.click(); await w(900); out.again = tiles();
      key('Escape'); await w(500); out.closed = Shelf.getMode();
      // Search by name: the picker's first tile → Settings' Search for page → Enter → the picker again, for that name
      key('i'); await w(900); const b3 = document.getElementById('dBoxArt'); if (b3) b3.click(); await w(900);
      const first = document.querySelector('.coverpick .cp-tile'); out.searchTile = first ? first.textContent.trim() : ''; if (first) first.click();
      for (let i = 0; i < 40 && !document.querySelector('#bss.on .bss-row'); i++) await w(150); await w(600);
      out.searchPage = (document.querySelector('#bss .bss-title') || {}).textContent || '';
      out.searchRows = [...document.querySelectorAll('#bss .bss-row .nm')].map(e => e.textContent).slice(0, 6);
      key('Enter'); await w(400); const inp = document.querySelector('#bss .bss-edit'); if (inp) { inp.value = 'Quarantine 1994'; inp.dispatchEvent(new Event('input', { bubbles: true })); } key('Enter');
      for (let i = 0; i < 30 && Shelf.getMode() !== 'cover'; i++) await w(200); await w(600);
      out.searchMode = Shelf.getMode(); out.term = window.__pcCoverTerm; out.searchNote = ((document.querySelector('.coverpick .cp-note') || {}).textContent || '');
      key('Escape'); await w(500); return out; });
    check('PC games (Windows): Box art on a PC game opens the cover picker (SteamGridDB covers, a picture of yours); A uses one and the picker closes; Automatic cover is offered after',
      cv.button && cv.mode === 'cover' && cv.tiles.length >= 4 && cv.tiles.some(t => /A picture of yours/.test(t)) && /SteamGridDB/.test(cv.at) && cv.moved !== cv.at && /3 covers from SteamGridDB/.test(cv.note)
        && cv.used['quiver-quarantine'] === 'sg1' && cv.after === 'browse' && /New cover for Quarantine/.test(cv.toast) && cv.again.some(t => /Automatic cover/.test(t)) && cv.closed === 'browse', JSON.stringify(cv).slice(0, 600));
    check('PC games (Windows): the cover picker\'s Search by name opens a Search for page; Enter brings the picker back with covers for the typed name',
      /Search by name/.test(cv.searchTile) && /Search for a cover/.test(cv.searchPage) && cv.searchMode === 'cover' && cv.term === 'Quarantine 1994' && /for "Quarantine 1994"/.test(cv.searchNote), JSON.stringify({ t: cv.searchTile, p: cv.searchPage, rows: cv.searchRows, m: cv.searchMode, term: cv.term, n: cv.searchNote }));
    // (beta.5) Details → Rename: Settings' Rename page; Enter saves the name, the shelf shows it; Use the file's name puts it back
    const rn = await page.evaluate(async () => { const w = ms => new Promise(r => setTimeout(r, ms)), out = {};
      const key = k => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
      for (let i = 0; i < 40 && Shelf.getMode() !== 'browse'; i++) await w(250);
      out.before = Shelf._qs().g;
      key('i'); await w(900); const b = document.getElementById('dRename'); out.button = !!b && !b.hidden; if (b) b.click();
      for (let i = 0; i < 40 && !document.querySelector('#bss.on .bss-row'); i++) await w(150); await w(700);
      out.page = (document.querySelector('#bss .bss-title') || {}).textContent || '';
      out.rows = [...document.querySelectorAll('#bss .bss-row')].map(r => r.textContent.replace(/\s+/g, ' ').trim().slice(0, 40)); out.cur = ((document.querySelector('#bss .bss-row.cur') || {}).textContent || '').slice(0, 40);
      // type the new name into the Name row (Settings' own text editing: Enter starts, typing, Enter saves)
      key('Enter'); await w(400); // (the page opens on its Name row: Enter starts editing it)
      const inp = document.querySelector('#bss .bss-edit'); out.editing = !!inp; if (inp) { inp.value = 'Quarantine DOS'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
      key('Enter'); await w(1200);
      out.saved = ((await window.boxshelf.getConfig()).config.games || {})['quiver-quarantine'];
      out.resetRow = [...document.querySelectorAll('#bss .bss-row .nm')].some(e => e.textContent === "Use the file's name");
      if (window.Settings && Settings.isOpen && Settings.isOpen()) { await Settings.close(); await w(1500); }
      for (let i = 0; i < 20 && Shelf._qs().g !== 'Quarantine DOS'; i++) await w(250); out.after = Shelf._qs().g;
      // and back: Rename → Use the file's name
      key('i'); await w(900); const b2 = document.getElementById('dRename'); if (b2) b2.click(); for (let i = 0; i < 40 && !document.querySelector('#bss.on .bss-row'); i++) await w(150); await w(700);
      const rr = [...document.querySelectorAll('#bss .bss-row')].find(r => ((r.querySelector('.nm') || {}).textContent || '') === "Use the file's name"); if (rr) rr.click(); await w(1200);
      if (window.Settings && Settings.isOpen && Settings.isOpen()) { await Settings.close(); await w(1500); }
      for (let i = 0; i < 20 && Shelf._qs().g !== 'Quarantine'; i++) await w(250); out.back = Shelf._qs().g; return out; });
    check('PC games (Windows): Details → Rename saves a game\'s own name (the shelf shows it), and Use the file\'s name puts it back',
      rn.button && /Rename/.test(rn.page) && rn.saved && rn.saved.title === 'Quarantine DOS' && rn.resetRow && rn.after === 'Quarantine DOS' && rn.back === 'Quarantine', JSON.stringify(rn).slice(0, 500));
    check('PC games pass (Windows page): no script errors', !errors.length, errors.slice(0, 3).join(' | '));
  } catch (e) { check('PC games pass (Windows page) ran to the end', false, e && e.stack ? e.stack.split('\n').slice(0, 2).join(' ') : e); }
  await ctx.close();

  // (beta.4) a big library (?big=3000: 3,000 games on every console): the shelf builds only the cases near the one in view,
  // so the page stays small however far you scroll or page through (measured: 21,000 games, ~27 cases, ~30 MB)
  const big = await newPage(browser, null);
  try {
    await big.page.goto(base + '?platform=windows&shelf=1&big=3000');
    await big.page.waitForFunction(() => window.Shelf && Shelf._qs && Shelf._qs().g && Shelf.getMode() === 'browse', null, { timeout: 120000, polling: 250 });
    const b = await big.page.evaluate(async () => { const w = ms => new Promise(r => setTimeout(r, ms));
      const key = k => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
      const total = Object.values(Shelf.gameCounts()).reduce((a, x) => a + x, 0); let most = 0;
      for (let i = 0; i < 40; i++) { key('ArrowRight'); await w(90); most = Math.max(most, document.querySelectorAll('#track > *').length); }
      for (let i = 0; i < 15; i++) { key('e'); await w(160); most = Math.max(most, document.querySelectorAll('#track > *').length); }
      key('ArrowDown'); await w(900); most = Math.max(most, document.querySelectorAll('#track > *').length);
      return { total, most, nodes: document.getElementsByTagName('*').length, game: Shelf._qs().g }; });
    check('Big library (21,000 games): the shelf keeps only the cases near the one in view (the page stays small while scrolling)',
      b.total >= 20000 && b.most > 0 && b.most <= 60 && b.nodes < 4000 && !!b.game, JSON.stringify(b));
    check('Big library pass: no script errors', !big.errors.length, big.errors.slice(0, 3).join(' | '));
  } catch (e) { check('Big library pass ran to the end', false, e && e.stack ? e.stack.split('\n').slice(0, 2).join(' ') : e); }
  await big.ctx.close();
};

// The sign-in page: sign in or create a free account (or carry on as a guest), and the special
// links — personal invites (/welcome), group links (/join), game invites (/?join=… as `next`) and
// first-time owner setup (/setup). Kept as a file so the content security policy can forbid
// inline scripts.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var form = $('form'), u = $('u'), p = $('p'), p2 = $('p2'), go = $('go'), goText = $('goText'), err = $('err');
  var card = $('card'), peek = $('peek'), note = $('note'), ctx = $('ctx'), uField = $('uField');
  var swap = $('swap'), swapText = $('swapText'), swapBtn = $('swapBtn');
  var q = new URLSearchParams(location.search);
  var path = location.pathname;
  // Only ever return to a path on this site.
  var nxt = q.get('next') || '/';
  if (nxt.charAt(0) !== '/' || nxt.charAt(1) === '/' || nxt.charAt(1) === '\\') nxt = '/';
  var joinToken = /^\/\?/.test(nxt) ? new URLSearchParams(nxt.slice(2)).get('join') : null; // a game invite
  var GAME_NAMES = { quiz: 'Map quiz', capitals: 'Capitals', trivia: 'Geo Trivia', top5: 'Name the Top 5', street: 'Street View' };

  // kind: what this page is for; tab: sign in or create (where both make sense).
  var kind = path === '/welcome' ? 'welcome' : path === '/setup' ? 'setup' : path === '/join' ? 'group' : joinToken ? 'game' : 'plain';
  var tab = q.get('tab') === 'signup' || kind === 'group' ? 'create' : 'signin';
  var game = null; // the game invite, once checked

  function show(el, on) { el.hidden = !on; }
  function say(html) { note.innerHTML = html; show(note, !!html); }
  function lock(html) { show(form, false); show(swap, false); say(html); }
  function getJSON(url) { return fetch(url, { credentials: 'same-origin' }).then(function (r) { return r.json(); }); }
  var esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  // What each situation says, and where the form goes. Kept short.
  function view() {
    var creating = tab === 'create' || kind === 'welcome' || kind === 'setup';
    var c = tab === 'create';
    var v = {
      plain: c ? { title: 'Join GeoQuest', sub: 'Free — just pick a username and password', go: 'Create account', url: '/api/signup' }
               : { title: 'GeoQuest', sub: 'Sign in to play with friends', go: 'Sign in', url: '/api/login' },
      game: c ? { title: 'Join the match', sub: 'Create a free account to play', go: 'Create account & join', url: game && game.signup ? '/api/invites/signup' : '/api/signup' }
              : { title: 'Sign in to join', sub: 'Then straight to the lobby', go: 'Sign in & join', url: '/api/login' },
      group: c ? { title: 'Join GeoQuest', sub: 'Pick a username and password', go: 'Join GeoQuest', url: '/api/group/join' }
               : { title: 'GeoQuest', sub: 'Sign in to play with friends', go: 'Sign in', url: '/api/login' },
      welcome: { title: 'Choose a password', sub: 'You’re joining as ' + (q.get('u') || ''), go: 'Join GeoQuest', url: '/api/invite/accept' },
      setup: { title: 'Set up GeoQuest', sub: 'Create the owner account', go: 'Create owner account', url: '/api/setup' },
    }[kind];
    $('title').textContent = v.title;
    $('sub').textContent = v.sub;
    goText.textContent = v.go;
    document.title = (c ? 'Create account' : 'Sign in') + ' — GeoQuest';
    swapText.textContent = c ? 'Have an account?' : 'New to GeoQuest?';
    swapBtn.textContent = c ? 'Sign in' : 'Create an account';
    p.setAttribute('autocomplete', creating ? 'new-password' : 'current-password');
    p.placeholder = creating ? 'Password (8+ characters)' : 'Password';
    show($('p2Label'), kind === 'setup');
    u.setAttribute('autocomplete', creating && kind !== 'welcome' ? 'off' : 'username');
    u.placeholder = creating && kind !== 'welcome' ? 'Pick a username' : 'Username';
    err.textContent = '';
    checkName();
    return v;
  }

  var NAME = /^[a-z0-9._-]{2,32}$/i;
  function checkName() {
    var creating = (tab === 'create' && kind !== 'welcome') || kind === 'setup';
    uField.classList.toggle('ok', creating && NAME.test(u.value.trim()));
  }
  u.addEventListener('input', checkName);
  swapBtn.addEventListener('click', function () { tab = tab === 'create' ? 'signin' : 'create'; view(); (u.value ? p : u).focus(); });

  // Guests: carry on exploring (a game invite needs an account, so that goes to the globe).
  $('guest').href = joinToken ? '/' : nxt;

  // ── Each kind of link ──
  if (kind === 'game') {
    getJSON('/api/invites/info?token=' + encodeURIComponent(joinToken)).then(function (d) {
      if (!d.valid) { say('This game link has expired — sign in or create an account, then ask for a fresh link.'); return; }
      game = d;
      ctx.innerHTML = '⚔️ <b>' + esc(d.host) + '</b> invited you to ' + esc(GAME_NAMES[d.game] || 'a game');
      show(ctx, true);
      tab = 'create'; view();
    }).catch(function () {});
  }
  if (kind === 'group') {
    getJSON('/api/group?code=' + encodeURIComponent(q.get('code') || '')).then(function (d) {
      if (!d.valid) { kind = 'plain'; tab = 'create'; view(); say('This group link has expired or is full — but you can still join here.'); return; }
      ctx.innerHTML = '👋 <b>' + esc(d.by) + '</b> invited you';
      show(ctx, true);
    }).catch(function () { lock('Couldn’t check this link — check your connection and reload.'); });
  }
  if (kind === 'welcome') {
    show(swap, false);
    ctx.innerHTML = '👋 You’re invited to GeoQuest';
    show(ctx, true);
    u.value = q.get('u') || ''; u.readOnly = true;
    getJSON('/api/invite?u=' + encodeURIComponent(q.get('u') || '') + '&t=' + encodeURIComponent(q.get('t') || ''))
      .then(function (d) {
        if (!d.valid) lock('This invite has expired or was already used. <a href="/login">Sign in</a> or <a href="/login?tab=signup">create an account</a>.');
        else p.focus();
      })
      .catch(function () { lock('Couldn’t check this invite — check your connection and reload.'); });
  }
  if (kind === 'setup') {
    show(swap, false); show($('guest'), false);
    getJSON('/api/setup').then(function (d) {
      if (!d.needsSetup) lock('GeoQuest is already set up. <a href="/login">Sign in →</a>');
      else if (!d.allowedHere) lock('For security, open setup from your Vercel-protected link' + (d.setupUrl ? ': <a href="' + esc(d.setupUrl) + '">' + esc(d.setupUrl) + '</a>' : '.'));
    }).catch(function () { lock('Couldn’t reach the server — reload to try again.'); });
  }
  if (kind === 'plain' && q.get('ready')) say('Your owner account is ready — sign in with it here.');
  view();
  if (kind !== 'welcome' && kind !== 'setup' && window.matchMedia('(hover: hover)').matches) u.focus();

  peek.addEventListener('click', function () {
    var showPw = p.type === 'password';
    p.type = p2.type = showPw ? 'text' : 'password';
    peek.textContent = showPw ? 'Hide' : 'Show';
    peek.setAttribute('aria-label', showPw ? 'Hide password' : 'Show password');
    p.focus();
  });

  function fail(msg) {
    err.textContent = msg;
    card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
    go.disabled = false; go.classList.remove('busy'); view();
    err.textContent = msg;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = view();
    var creating = tab === 'create' || kind === 'welcome' || kind === 'setup';
    var name = u.value.trim();
    if (!name || !p.value) { fail(creating ? 'Choose a username and password.' : 'Enter your username and password.'); (name ? p : u).focus(); return; }
    if (creating) {
      if (kind !== 'welcome' && !NAME.test(name)) { fail('Usernames are 2–32 letters, numbers, dots, dashes or underscores.'); u.focus(); return; }
      if (p.value.length < 8) { fail('Use at least 8 characters for your password.'); p.focus(); return; }
      if (kind === 'setup' && p.value !== p2.value) { fail('The passwords don’t match.'); p2.focus(); return; }
    }
    go.disabled = true; go.classList.add('busy');
    goText.textContent = creating ? 'Creating your account…' : 'Signing in…';
    var payload = { username: name, password: p.value };
    if (kind === 'welcome') payload.token = q.get('t') || '';
    if (kind === 'group') payload.code = q.get('code') || '';
    if (v.url === '/api/invites/signup') payload.token = joinToken;
    fetch(v.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(payload) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (x) {
        if (x.ok) {
          goText.textContent = creating ? 'Welcome to GeoQuest!' : 'Welcome back!';
          location.replace(kind === 'setup' || kind === 'welcome' ? (x.d.next || '/') : kind === 'group' ? '/' : nxt);
          return;
        }
        fail(x.d.error || 'Something went wrong — try again.');
        if (!creating && x.d.error && /password/i.test(x.d.error)) p.select();
        if (creating && /taken/i.test(x.d.error || '')) { u.focus(); u.select(); }
      })
      .catch(function () { fail('Couldn’t reach the server — check your connection.'); });
  });
})();

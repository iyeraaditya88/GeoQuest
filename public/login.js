// The sign-in page: sign in or create a free account (or carry on as a guest), and the special
// links — personal invites (/welcome), group links (/join), game invites (/?join=… as `next`) and
// first-time owner setup (/setup). Kept as a file so the content security policy can forbid
// inline scripts.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var form = $('form'), u = $('u'), p = $('p'), p2 = $('p2'), go = $('go'), goText = $('goText'), err = $('err');
  var card = $('card'), peek = $('peek'), note = $('note'), foot = $('foot'), ctx = $('ctx'), tabs = $('tabs');
  var uField = $('uField'), uHint = $('uHint'), meter = $('meter');
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
  function lock(html) { show(form, false); show(tabs, false); say(html); }
  function getJSON(url) { return fetch(url, { credentials: 'same-origin' }).then(function (r) { return r.json(); }); }
  var esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  // What each situation says, and where the form goes.
  function view() {
    var creating = tab === 'create' || kind === 'welcome' || kind === 'setup';
    var v = {
      plain: tab === 'create'
        ? { title: 'Create your free account', sub: 'Challenge friends, keep your streak and save your places.', go: 'Create free account', url: '/api/signup' }
        : { title: 'Welcome back', sub: 'Sign in to play with your friends.', go: 'Sign in', url: '/api/login' },
      game: tab === 'create'
        ? { title: 'Join the match', sub: 'Create a free account — it takes ten seconds.', go: 'Create account & join', url: game && game.signup ? '/api/invites/signup' : '/api/signup' }
        : { title: 'Sign in to join', sub: 'Then you’ll go straight to the lobby.', go: 'Sign in & join', url: '/api/login' },
      group: tab === 'create'
        ? { title: 'You’re invited!', sub: 'Pick a username and password to join GeoQuest.', go: 'Join GeoQuest', url: '/api/group/join' }
        : { title: 'Welcome back', sub: 'Already have an account? Sign in.', go: 'Sign in', url: '/api/login' },
      welcome: { title: 'Choose your password', sub: 'Your username is ready — just pick a password.', go: 'Join GeoQuest', url: '/api/invite/accept' },
      setup: { title: 'Set up GeoQuest', sub: 'Create the owner account — you can invite people from the app.', go: 'Create owner account', url: '/api/setup' },
    }[kind];
    $('title').textContent = v.title;
    $('sub').textContent = v.sub;
    goText.textContent = v.go;
    tabs.dataset.tab = tab;
    $('tabSignin').setAttribute('aria-selected', String(tab === 'signin'));
    $('tabCreate').setAttribute('aria-selected', String(tab === 'create'));
    // New password (with a strength meter) vs. your existing one.
    p.setAttribute('autocomplete', creating ? 'new-password' : 'current-password');
    p.placeholder = creating ? 'At least 8 characters' : '';
    show(meter, creating);
    show($('p2Label'), kind === 'setup');
    u.setAttribute('autocomplete', creating && kind !== 'welcome' ? 'off' : 'username');
    u.placeholder = creating && kind !== 'welcome' ? 'e.g. maya or sam.k' : '';
    err.textContent = '';
    checkName();
    return v;
  }

  // Username: friendly live feedback while creating an account.
  var NAME = /^[a-z0-9._-]{2,32}$/i;
  function checkName() {
    var creating = (tab === 'create' && kind !== 'welcome') || kind === 'setup';
    var v = u.value.trim();
    uField.classList.toggle('ok', creating && NAME.test(v));
    uField.classList.toggle('bad', creating && v.length > 1 && !NAME.test(v));
    show(uHint, creating);
    if (!creating) return;
    uHint.className = 'hint' + (NAME.test(v) ? ' ok' : v.length > 1 ? ' bad' : '');
    uHint.textContent = NAME.test(v) ? '✓ Looks good — friends will see this name' : v.length > 1 ? 'Use 2–32 letters, numbers, dots, dashes or underscores' : 'Letters, numbers, dots, dashes or underscores — friends will see it';
  }
  function strength(pw) { return !pw ? 0 : pw.length < 8 ? 1 : pw.length >= 12 || (pw.length >= 10 && /[^a-z]/i.test(pw) && /[a-z]/i.test(pw)) ? 3 : 2; }
  u.addEventListener('input', checkName);
  p.addEventListener('input', function () { meter.dataset.s = String(strength(p.value)); });

  function setTab(t) { if (tab === t) return; tab = t; view(); (u.value ? p : u).focus(); }
  $('tabSignin').addEventListener('click', function () { setTab('signin'); });
  $('tabCreate').addEventListener('click', function () { setTab('create'); });

  // Guests: carry on exploring (a game invite needs an account, so that goes to the globe).
  $('guest').href = joinToken ? '/' : nxt;

  // ── Each kind of link ──
  if (kind === 'game') {
    getJSON('/api/invites/info?token=' + encodeURIComponent(joinToken)).then(function (d) {
      if (!d.valid) { say('This game link has expired — sign in or create an account, then ask for a fresh link.'); return; }
      game = d;
      ctx.innerHTML = '<i>⚔️</i><span><b>' + esc(d.host) + '</b> invited you to a live <b>' + esc(GAME_NAMES[d.game] || 'game') + '</b> match</span>';
      show(ctx, true);
      tab = 'create'; view();
    }).catch(function () {});
  }
  if (kind === 'group') {
    show(tabs, true);
    getJSON('/api/group?code=' + encodeURIComponent(q.get('code') || '')).then(function (d) {
      if (!d.valid) { tab = 'signin'; view(); show($('tabCreate'), false); say('This group link has expired or is full — ask whoever shared it for a new one, or <a href="/login?tab=signup">create an account here</a>.'); return; }
      ctx.innerHTML = '<i>👋</i><span><b>' + esc(d.by) + '</b> invited you to GeoQuest</span>';
      show(ctx, true);
    }).catch(function () { lock('Couldn’t check this link — check your connection and reload.'); });
  }
  if (kind === 'welcome') {
    show(tabs, false);
    ctx.innerHTML = '<i>👋</i><span>You’ve been invited to GeoQuest</span>';
    show(ctx, true);
    u.value = q.get('u') || ''; u.readOnly = true;
    $('sub').textContent = 'Your username is ' + (q.get('u') || '') + ' — just pick a password.';
    getJSON('/api/invite?u=' + encodeURIComponent(q.get('u') || '') + '&t=' + encodeURIComponent(q.get('t') || ''))
      .then(function (d) {
        if (!d.valid) lock('This invite link has expired or was already used. <a href="/login">Sign in</a> if you’ve already joined — or <a href="/login?tab=signup">create a free account</a>.');
        else p.focus();
      })
      .catch(function () { lock('Couldn’t check this invite — check your connection and reload.'); });
  }
  if (kind === 'setup') {
    show(tabs, false); show($('guestBox'), false);
    foot.textContent = 'Only reachable from your Vercel-protected link.';
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

// Sign-in page (also handles invite links and first-time owner setup). Kept as a file so the
// content security policy can forbid inline scripts.
      (function () {
        var $ = function (id) { return document.getElementById(id); };
        var form = $('form'), u = $('u'), p = $('p'), p2 = $('p2'), go = $('go'), goText = $('goText'), err = $('err');
        var card = $('card'), peek = $('peek'), note = $('note'), foot = $('foot');
        var q = new URLSearchParams(location.search);
        var mode = location.pathname === '/welcome' ? 'welcome' : location.pathname === '/setup' ? 'setup' : location.pathname === '/join' ? 'group' : 'login';
        var LABELS = { login: 'Sign in', welcome: 'Join GeoQuest', setup: 'Create owner account', signup: 'Create account & join', group: 'Join GeoQuest' };
        var label = LABELS[mode];
        // Only ever return to a path on this site.
        var nxt = q.get('next') || '/';
        if (nxt.charAt(0) !== '/' || nxt.charAt(1) === '/' || nxt.charAt(1) === '\\') nxt = '/';

        function show(el, on) { el.hidden = !on; }
        function say(html) { note.innerHTML = html; show(note, !!html); }
        function lock(msg) { show(form, false); say(msg); }
        function setBusy(b, text) { go.disabled = b; go.classList.toggle('busy', b); goText.textContent = text || label; }
        function fail(msg) {
          err.textContent = msg;
          card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
          setBusy(false);
        }
        function getJSON(url) { return fetch(url, { credentials: 'same-origin' }).then(function (r) { return r.json(); }); }
        var esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

        // New password (welcome, setup, sign-up) vs. signing in with an existing one.
        function newPassword(on) {
          show($('p2Label'), on);
          p.setAttribute('autocomplete', on ? 'new-password' : 'current-password');
          p.placeholder = on ? 'At least 8 characters' : '';
        }
        setBusy(false);
        if (mode !== 'login') newPassword(true);

        // A game link (/?join=…) opened while signed out: say who's inviting, and — on the owner's
        // links — let a newcomer create an account right here and drop straight into the lobby.
        var joinToken = /^\/\?/.test(nxt) ? new URLSearchParams(nxt.slice(2)).get('join') : null;
        var GAME_NAMES = { quiz: 'Map quiz', capitals: 'Capitals', trivia: 'Geo Trivia', top5: 'Name the Top 5', street: 'Street View' };
        var invite = null;
        function joinMode(m) {
          mode = m; label = LABELS[m]; setBusy(false); err.textContent = '';
          newPassword(m === 'signup');
          u.setAttribute('autocomplete', m === 'signup' ? 'off' : 'username');
          u.placeholder = m === 'signup' ? 'e.g. maya or sam.k' : '';
          $('sub').textContent = m === 'signup' ? 'Create an account to join the game' : 'Sign in to join the game';
          foot.innerHTML = m === 'signup'
            ? 'Already have an account? <a href="#" id="swap">Sign in</a>'
            : invite.signup ? 'New to GeoQuest? <a href="#" id="swap">Create an account</a>' : 'Need an account? Ask ' + esc(invite.host) + ' for an invite.';
          var swap = $('swap');
          if (swap) swap.addEventListener('click', function (e) { e.preventDefault(); joinMode(mode === 'signup' ? 'login' : 'signup'); u.focus(); });
        }

        if (mode === 'login' && joinToken) {
          getJSON('/api/invites/info?token=' + encodeURIComponent(joinToken)).then(function (d) {
            if (!d.valid) { say('This game link has expired — sign in, or ask for a fresh link.'); return; }
            invite = d;
            $('title').textContent = d.host + ' invited you to play!';
            say('<b>' + esc(GAME_NAMES[d.game] || 'A game') + '</b> · live match');
            joinMode(d.signup ? 'signup' : 'login');
          }).catch(function () {});
        } else if (mode === 'login' && q.get('ready')) say('Your owner account is ready — sign in with it here.');
        else if (mode === 'login') {
          getJSON('/api/setup').then(function (d) {
            if (d.needsSetup) say('GeoQuest isn’t set up yet.' + (d.setupUrl ? ' Owner? <a href="' + esc(d.setupUrl) + '">Finish setup →</a>' : ''));
          }).catch(function () {});
        }

        if (mode === 'welcome') {
          $('title').textContent = 'You’re invited!';
          $('sub').textContent = 'Choose a password to join GeoQuest';
          foot.textContent = 'Your password is yours alone — nobody else ever sees it.';
          u.value = q.get('u') || ''; u.readOnly = true; u.removeAttribute('autofocus');
          getJSON('/api/invite?u=' + encodeURIComponent(q.get('u') || '') + '&t=' + encodeURIComponent(q.get('t') || ''))
            .then(function (d) {
              if (!d.valid) lock('This invite link has expired or was already used. Ask the person who invited you for a fresh one — or <a href="/login">sign in</a> if you’ve already joined.');
              else p.focus();
            })
            .catch(function () { lock('Couldn’t check this invite — check your connection and reload.'); });
        }

        // A group invite link (one link for a whole chat): pick your own username and password.
        if (mode === 'group') {
          $('title').textContent = 'You’re invited!';
          $('sub').textContent = 'Pick a username and password to join GeoQuest';
          u.placeholder = 'e.g. maya or sam.k';
          u.setAttribute('autocomplete', 'off');
          foot.innerHTML = 'Already have an account? <a href="/login">Sign in</a>';
          getJSON('/api/group?code=' + encodeURIComponent(q.get('code') || ''))
            .then(function (d) {
              if (!d.valid) lock('This group link has expired or is full. Ask whoever shared it for a new one — or <a href="/login">sign in</a> if you’ve already joined.');
              else $('sub').textContent = d.by + ' invited you — pick a username and password to join GeoQuest';
            })
            .catch(function () { lock('Couldn’t check this link — check your connection and reload.'); });
        }

        if (mode === 'setup') {
          $('title').textContent = 'Set up GeoQuest';
          $('sub').textContent = 'Create the owner account — you’ll invite everyone else from the app';
          foot.textContent = 'Only reachable from your Vercel-protected link.';
          getJSON('/api/setup').then(function (d) {
            if (!d.needsSetup) lock('GeoQuest is already set up. <a href="/login">Sign in →</a>');
            else if (!d.allowedHere) lock('For security, open setup from your Vercel-protected link' + (d.setupUrl ? ': <a href="' + esc(d.setupUrl) + '">' + esc(d.setupUrl) + '</a>' : '.'));
          }).catch(function () { lock('Couldn’t reach the server — reload to try again.'); });
        }

        peek.addEventListener('click', function () {
          var showPw = p.type === 'password';
          p.type = p2.type = showPw ? 'text' : 'password';
          peek.textContent = showPw ? 'Hide' : 'Show';
          peek.setAttribute('aria-label', showPw ? 'Hide password' : 'Show password');
          p.focus();
        });

        form.addEventListener('submit', function (e) {
          e.preventDefault();
          if (!u.value.trim() || !p.value) { fail(mode === 'login' ? 'Enter your username and password.' : 'Choose a username and password.'); (u.value.trim() ? p : u).focus(); return; }
          if (mode !== 'login') {
            if ((mode === 'signup' || mode === 'group') && !/^[a-z0-9._-]{2,32}$/i.test(u.value.trim())) { fail('Usernames are 2–32 letters, digits, dots, dashes or underscores.'); u.focus(); return; }
            if (p.value.length < 8) { fail('Use at least 8 characters.'); p.focus(); return; }
            if (p.value !== p2.value) { fail('The passwords don’t match.'); p2.focus(); return; }
          }
          err.textContent = '';
          setBusy(true, mode === 'login' ? 'Signing in…' : mode === 'signup' || mode === 'group' ? 'Creating your account…' : 'Setting up…');
          var url = { login: '/api/login', welcome: '/api/invite/accept', setup: '/api/setup', signup: '/api/invites/signup', group: '/api/group/join' }[mode];
          var payload = { username: u.value.trim(), password: p.value };
          if (mode === 'welcome') payload.token = q.get('t') || '';
          if (mode === 'signup') payload.token = joinToken;
          if (mode === 'group') payload.code = q.get('code') || '';
          fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(payload) })
            .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; }); })
            .then(function (x) {
              if (x.ok) { goText.textContent = 'Welcome!'; location.replace(mode === 'login' || mode === 'signup' ? nxt : (x.d.next || '/')); return; }
              fail(x.d.error || 'Something went wrong — try again.');
              if (mode === 'login' && x.d.error && /password/i.test(x.d.error)) p.select();
            })
            .catch(function () { fail('Couldn’t reach the server — check your connection.'); });
        });
      })();

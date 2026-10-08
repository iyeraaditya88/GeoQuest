// Sign-in page (also handles invite links and first-time owner setup). Kept as a file so the
// content security policy can forbid inline scripts.
      (function () {
        var $ = function (id) { return document.getElementById(id); };
        var form = $('form'), u = $('u'), p = $('p'), p2 = $('p2'), go = $('go'), goText = $('goText'), err = $('err');
        var card = $('card'), peek = $('peek'), note = $('note'), foot = $('foot');
        var q = new URLSearchParams(location.search);
        var mode = location.pathname === '/welcome' ? 'welcome' : location.pathname === '/setup' ? 'setup' : 'login';
        var label = { login: 'Sign in', welcome: 'Join GeoQuest', setup: 'Create owner account' }[mode];
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

        setBusy(false);
        if (mode !== 'login') {
          show($('p2Label'), true);
          p.setAttribute('autocomplete', 'new-password');
          p.placeholder = 'At least 8 characters';
        }

        if (mode === 'login' && q.get('ready')) say('Your owner account is ready — sign in with it here.');
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
            if (p.value.length < 8) { fail('Use at least 8 characters.'); p.focus(); return; }
            if (p.value !== p2.value) { fail('The passwords don’t match.'); p2.focus(); return; }
          }
          err.textContent = '';
          setBusy(true, mode === 'login' ? 'Signing in…' : 'Setting up…');
          var url = mode === 'login' ? '/api/login' : mode === 'welcome' ? '/api/invite/accept' : '/api/setup';
          var payload = { username: u.value.trim(), password: p.value };
          if (mode === 'welcome') payload.token = q.get('t') || '';
          fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(payload) })
            .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; }); })
            .then(function (x) {
              if (x.ok) { goText.textContent = 'Welcome!'; location.replace(mode === 'login' ? nxt : (x.d.next || '/')); return; }
              fail(x.d.error || 'Something went wrong — try again.');
              if (mode === 'login' && x.d.error && /password/i.test(x.d.error)) p.select();
            })
            .catch(function () { fail('Couldn’t reach the server — check your connection.'); });
        });
      })();

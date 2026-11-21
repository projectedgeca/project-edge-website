/* Project Edge — Supabase Authentication, Phase 1
   Email + password, invitation-only (public sign-up is NOT implemented), password reset, logout, account page.
   Uses only the Project URL and the PUBLISHABLE key from config.js. No secrets. No mock logins:
   if configuration or the library is missing, the login page says so and the form is not shown. */
(function () {
  'use strict';
  var C = window.PE_CONFIG || {}, sb = null, session = null, ready = false, reason = '';
  var pending = null, flash = '', flashPage = '', mode = 'login', fails = [], lockUntil = 0;
  var TYPES = ['invite', 'recovery', 'email', 'signup', 'magiclink', 'email_change'];
  var MIN_PW = 10;

  function T(a) { return t(a); }
  function Q(s) { return document.querySelector(s); }
  function go(h) { if (location.hash !== h) { location.hash = h; } else { dispatchEvent(new HashChangeEvent('hashchange')); } }
  function cur() { return (location.hash || '#home').slice(1); }

  /* ---------- configuration checks ---------- */
  function check() {
    var u = String(C.SUPABASE_URL || '').trim().replace(/\/+$/, ''), k = String(C.SUPABASE_PUBLISHABLE_KEY || '').trim();
    if (!u || !k) return 'noconfig';
    if (!/^https:\/\/[a-z0-9-]{8,40}\.supabase\.co$/.test(u)) return 'badurl';
    if (/^sb_secret_/.test(k)) return 'secret';
    var p = k.split('.');
    if (p.length === 3) {
      try { var pl = JSON.parse(atob(p[1].replace(/-/g, '+').replace(/_/g, '/'))); if (pl.role && pl.role !== 'anon') return 'secret'; }
      catch (e) { return 'badkey'; }
    } else if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(k)) return 'badkey';
    if (!window.supabase || typeof window.supabase.createClient !== 'function') return 'nolib';
    return 'ok';
  }

  /* ---------- link data: captured and REMOVED from the address bar by the inline script in <head> ---------- */
  var link = window.__PE_LINK || null, linkTokens = null, linkCode = null, verifying = false;
  try { delete window.__PE_LINK; } catch (e) { window.__PE_LINK = undefined; }
  function okJwt(x) { return typeof x === 'string' && x.length < 4096 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(x); }
  if (link) {
    var lt = link.type || '';
    if (link.error || link.error_code) { setFlash('linkerr', 'login'); }
    else if (link.token_hash && TYPES.indexOf(lt) >= 0) { pending = { th: link.token_hash, ty: lt }; }              /* custom email templates (later) */
    else if (okJwt(link.access_token) && typeof link.refresh_token === 'string' && link.refresh_token.length < 512 && (lt === 'invite' || lt === 'recovery')) { linkTokens = { at: link.access_token, rt: link.refresh_token, ty: lt }; verifying = true; } /* default Supabase emails (implicit) */
    else if (typeof link.code === 'string' && /^[A-Za-z0-9._~-]{8,512}$/.test(link.code)) { linkCode = link.code; verifying = true; }    /* PKCE */
    else { setFlash('linkerr', 'login'); }
    link = null;
  }
  function markRecovery() { try { localStorage.setItem('pe_recovery_req', String(Date.now())); } catch (e) { } }
  function takeRecovery() { try { var v = +localStorage.getItem('pe_recovery_req'); localStorage.removeItem('pe_recovery_req'); return !!v && Date.now() - v < 3600000; } catch (e) { return false; } }

  reason = check();
  if (reason === 'secret') { console.error('Project Edge: a secret key was found in config.js. Authentication is disabled. Remove it and rotate that key in Supabase.'); }

  /* ---------- messages (English / Canadian French) ---------- */
  var M = {
    cred: ['Incorrect email or password.', 'Courriel ou mot de passe incorrect.'],
    unconf: ['Your email is not confirmed yet. Use the link in your invitation email.', 'Votre courriel n’est pas encore confirmé. Utilisez le lien de votre courriel d’invitation.'],
    invonly: ['Accounts are by invitation only. Public registration is not available.', 'Les comptes sont offerts sur invitation seulement. L’inscription publique n’est pas offerte.'],
    rate: ['Too many attempts. Please wait a few minutes and try again.', 'Trop de tentatives. Veuillez patienter quelques minutes et réessayer.'],
    locked: ['Too many failed attempts. Please wait 30 seconds.', 'Trop de tentatives échouées. Veuillez patienter 30 secondes.'],
    network: ['Could not reach the sign-in service. Check your connection and try again.', 'Impossible de joindre le service de connexion. Vérifiez votre connexion et réessayez.'],
    expired: ['This link is invalid or has expired. Ask for a new invitation or request a new password reset.', 'Ce lien est invalide ou a expiré. Demandez une nouvelle invitation ou un nouveau lien de réinitialisation.'],
    weak: ['This password is too weak. Use at least ' + MIN_PW + ' characters.', 'Ce mot de passe est trop faible. Utilisez au moins ' + MIN_PW + ' caractères.'],
    same: ['Choose a password different from the previous one.', 'Choisissez un mot de passe différent du précédent.'],
    nosess: ['Your session has ended. Please log in again.', 'Votre session est terminée. Veuillez vous reconnecter.'],
    generic: ['Something went wrong. Please try again.', 'Un problème est survenu. Veuillez réessayer.'],
    missing: ['Please fill in all fields.', 'Veuillez remplir tous les champs.'],
    short: ['Use at least ' + MIN_PW + ' characters.', 'Utilisez au moins ' + MIN_PW + ' caractères.'],
    nomatch: ['The two passwords do not match.', 'Les deux mots de passe ne correspondent pas.'],
    sent: ['If an account exists for this email, a reset link has been sent. Check your inbox.', 'Si un compte existe pour ce courriel, un lien de réinitialisation a été envoyé. Vérifiez votre boîte de réception.'],
    loggedout: ['You have been logged out.', 'Vous avez été déconnecté.'],
    needlogin: ['Please log in to see your account.', 'Veuillez vous connecter pour voir votre compte.'],
    linkerr: ['This link is invalid or has expired. Ask for a new invitation or request a password reset.', 'Ce lien est invalide ou a expiré. Demandez une nouvelle invitation ou un nouveau lien de réinitialisation.'],
    pkce: ['This link must be opened in the same browser where you asked for it. Please request a new link from the log-in page.', 'Ce lien doit être ouvert dans le même navigateur que celui où vous l’avez demandé. Veuillez demander un nouveau lien depuis la page de connexion.'],
    verifying: ['Verifying your link…', 'Vérification de votre lien…'],
    pwset: ['Your password has been saved.', 'Votre mot de passe a été enregistré.']
  };
  var CFG = {
    noconfig: ['Sign-in is not configured on this site yet. Please check back soon.', 'La connexion n’est pas encore configurée sur ce site. Revenez bientôt.'],
    badurl: ['The sign-in configuration is invalid (Project URL). Sign-in is disabled.', 'La configuration de connexion est invalide (URL du projet). La connexion est désactivée.'],
    badkey: ['The sign-in configuration is invalid (key). Sign-in is disabled.', 'La configuration de connexion est invalide (clé). La connexion est désactivée.'],
    secret: ['A secret key was detected in the site configuration. Sign-in has been disabled for safety. The site owner must remove it and rotate the key.', 'Une clé secrète a été détectée dans la configuration du site. La connexion a été désactivée par sécurité. Le propriétaire du site doit la retirer et la renouveler.'],
    nolib: ['The authentication library is not installed on this site. Sign-in is disabled.', 'La bibliothèque d’authentification n’est pas installée sur ce site. La connexion est désactivée.']
  };

  function errKey(err) {
    var c = ((err && err.code) || '') + ' ' + ((err && err.message) || ''), s = err && err.status;
    if (s === 429 || /rate.?limit|too many|over_.*limit/i.test(c)) return 'rate';
    if (/invalid_credentials|invalid login/i.test(c)) return 'cred';
    if (/email_not_confirmed|not confirmed/i.test(c)) return 'unconf';
    if (/signup.*(disabled|not allowed)|signups? not allowed/i.test(c)) return 'invonly';
    if (/weak_password|password.*(short|weak|least)/i.test(c)) return 'weak';
    if (/same_password|different from the old/i.test(c)) return 'same';
    if (/code verifier|verifier|pkce/i.test(c)) return 'pkce';
    if (/otp_expired|expired|invalid.*(token|otp)|token.*invalid/i.test(c)) return 'expired';
    if (/session|jwt|not authenticated|missing/i.test(c)) return 'nosess';
    if (/failed to fetch|network|load failed/i.test(c)) return 'network';
    return 'generic';
  }

  /* ---------- small UI helpers (user data is only ever set with textContent) ---------- */
  function box(id) { return Q('#' + id + ' .wrap'); }
  function note(kind, key) { return '<p class="msg ' + kind + '" role="status">' + T(M[key]) + '</p>'; }
  function setFlash(k, page) { flash = k; flashPage = page; }
  function takeFlash() { return flash ? note(flash === 'loggedout' || flash === 'pwset' ? 'good' : 'err', flash) : ''; }
  function setMsg(form, kind, key) { var m = form.querySelector('.fm'); m.className = 'msg fm ' + kind; m.textContent = T(M[key]); m.hidden = false; }
  function busy(form, on) { var b = form.querySelector('button[type=submit]'); b.disabled = on; form.setAttribute('aria-busy', on ? 'true' : 'false'); }
  function field(id, label, type, ac) { return '<label for="' + id + '">' + label + '</label><input id="' + id + '" name="' + id + '" type="' + type + '" autocomplete="' + ac + '" required' + (type === 'password' ? ' minlength="' + MIN_PW + '"' : '') + ' maxlength="256">'; }
  function head(en, fr, sub) { return '<div class="eyebrow">' + T(['ACCOUNT', 'COMPTE']) + '</div><h1>' + T(en) + '</h1>' + (sub ? '<p class="sub">' + T(sub) + '</p>' : ''); }
  function setNav() {
    var a = document.getElementById('authlink'); if (!a) return;
    a.textContent = session ? T(['Account', 'Mon compte']) : T(['Log in', 'Connexion']);
    a.setAttribute('href', session ? '#account' : '#login');
  }
  function disabledView(id) {
    box(id).innerHTML = '<div class="auth">' + head(['Log in', 'Connexion']) + '<div class="card"><p>' + T(CFG[reason] || CFG.noconfig) + '</p><p class="note">' + T(['Questions? Email hockeyprojectedge@gmail.com.', 'Des questions? Écrivez à hockeyprojectedge@gmail.com.']) + '</p></div></div>';
  }
  function loading(id, key) { box(id).innerHTML = '<div class="auth">' + head(['Account', 'Mon compte']) + '<p class="msg" role="status">' + (key ? T(M[key]) : T(['Checking your session…', 'Vérification de votre session…'])) + '</p></div>'; }

  /* ---------- views ---------- */
  function paintLogin() {
    if (reason !== 'ok') return disabledView('login');
    if (verifying) return loading('login', 'verifying');
    var inv = '<p class="note">' + T(['Accounts are currently by invitation only. Public registration is not available. Use the link in your invitation email to activate your account.', 'Les comptes sont actuellement offerts sur invitation seulement. L’inscription publique n’est pas offerte. Utilisez le lien de votre courriel d’invitation pour activer votre compte.']) + '</p>';
    var h;
    if (mode === 'forgot') {
      h = head(['Reset your password', 'Réinitialiser votre mot de passe'], 0, ['Enter your email and we will send a reset link if an account exists.', 'Entrez votre courriel et nous enverrons un lien de réinitialisation si un compte existe.']) + takeFlash() +
        '<form id="ff" class="card" novalidate>' + field('fe', T(['Email', 'Courriel']), 'email', 'email') + '<p class="msg fm" hidden role="status"></p><button class="btn p" type="submit">' + T(['Send reset link', 'Envoyer le lien']) + '</button><button class="lnk" type="button" id="bk">' + T(['Back to log in', 'Retour à la connexion']) + '</button></form>';
    } else {
      h = head(['Log in', 'Connexion']) + takeFlash() + inv +
        '<form id="lf" class="card" novalidate>' + field('le', T(['Email', 'Courriel']), 'email', 'username') + field('lp', T(['Password', 'Mot de passe']), 'password', 'current-password') + '<p class="msg fm" hidden role="status"></p><button class="btn p" type="submit">' + T(['Log in', 'Se connecter']) + '</button><button class="lnk" type="button" id="fg">' + T(['Forgot your password?', 'Mot de passe oublié?']) + '</button></form>';
    }
    box('login').innerHTML = '<div class="auth">' + h + '</div>';
    var lf = Q('#lf'), ff = Q('#ff');
    if (lf) { lf.addEventListener('submit', doLogin); Q('#fg').onclick = function () { mode = 'forgot'; paint(); }; }
    if (ff) { ff.addEventListener('submit', doForgot); Q('#bk').onclick = function () { mode = 'login'; paint(); }; }
  }
  function paintConfirm() {
    if (reason !== 'ok') return disabledView('confirm');
    if (!pending) { box('confirm').innerHTML = ''; return; }
    var inv = pending.ty === 'invite', rec = pending.ty === 'recovery';
    box('confirm').innerHTML = '<div class="auth">' + head(inv ? ['Activate your account', 'Activer votre compte'] : rec ? ['Reset your password', 'Réinitialiser votre mot de passe'] : ['Confirm your email', 'Confirmer votre courriel'], 0,
      inv ? ['You have been invited to Project Edge. Continue to choose your password.', 'Vous êtes invité à Project Edge. Continuez pour choisir votre mot de passe.'] : rec ? ['Continue to choose a new password.', 'Continuez pour choisir un nouveau mot de passe.'] : ['Continue to confirm your email.', 'Continuez pour confirmer votre courriel.']) +
      '<form id="cfm" class="card"><p class="msg fm" hidden role="status"></p><button class="btn p" type="submit">' + T(['Continue', 'Continuer']) + '</button></form></div>';
    Q('#cfm').addEventListener('submit', doConfirm);
  }
  function paintReset() {
    if (reason !== 'ok') return disabledView('reset');
    if (!ready) return loading('reset');
    box('reset').innerHTML = '<div class="auth">' + head(['Choose your password', 'Choisissez votre mot de passe'], 0, ['Use at least ' + MIN_PW + ' characters. A long, unique passphrase is best.', 'Utilisez au moins ' + MIN_PW + ' caractères. Une longue phrase de passe unique est idéale.']) +
      '<form id="pf" class="card" novalidate>' + field('p1', T(['New password', 'Nouveau mot de passe']), 'password', 'new-password') + field('p2', T(['Confirm password', 'Confirmer le mot de passe']), 'password', 'new-password') + '<p class="msg fm" hidden role="status"></p><button class="btn p" type="submit">' + T(['Save password', 'Enregistrer le mot de passe']) + '</button></form></div>';
    Q('#pf').addEventListener('submit', doSetPw);
  }
  function paintAccount() {
    if (reason !== 'ok') return disabledView('account');
    if (!ready) return loading('account');
    if (!session) { box('account').innerHTML = ''; return; }
    var loc = L === 'fr' ? 'fr-CA' : 'en-CA', u = session.user || {}, fmt = function (d) { try { return d ? new Date(d).toLocaleString(loc, { dateStyle: 'medium', timeStyle: 'short' }) : '—'; } catch (e) { return '—'; } };
    box('account').innerHTML = '<div class="auth">' + head(['Your account', 'Votre compte']) + takeFlash() +
      '<div class="card"><dl class="dl2"><dt>' + T(['Email', 'Courriel']) + '</dt><dd id="ae"></dd><dt>' + T(['Account created', 'Compte créé']) + '</dt><dd id="ac"></dd><dt>' + T(['Last sign-in', 'Dernière connexion']) + '</dt><dd id="al"></dd><dt>' + T(['Status', 'Statut']) + '</dt><dd>' + T(['Invited early-access account. The Project Edge application has not launched and no subscription is active.', 'Compte d’accès anticipé sur invitation. L’application Project Edge n’est pas lancée et aucun abonnement n’est actif.']) + '</dd></dl>' +
      '<p class="msg fm" hidden role="status"></p><button class="btn p" type="button" id="lo">' + T(['Log out', 'Se déconnecter']) + '</button> <button class="btn" type="button" id="rp">' + T(['Email me a password reset link', 'M’envoyer un lien de réinitialisation']) + '</button></div>' +
      '<p class="note">' + T(['To request access, correction or deletion of your information, email hockeyprojectedge@gmail.com. See the ', 'Pour demander l’accès, la correction ou la suppression de vos renseignements, écrivez à hockeyprojectedge@gmail.com. Voir la ']) + '<a class="ph" href="#privacy">' + T(['Privacy Policy', 'Politique de confidentialité']) + '</a>.</p></div>';
    Q('#ae').textContent = u.email || '—'; Q('#ac').textContent = fmt(u.created_at); Q('#al').textContent = fmt(u.last_sign_in_at);
    Q('#lo').onclick = doLogout; Q('#rp').onclick = doAcctReset;
  }
  function paint() { setNav(); paintLogin(); paintConfirm(); paintReset(); paintAccount(); if (window.fixH) fixH(); }

  /* ---------- actions (all call the real Supabase Auth API) ---------- */
  async function doLogin(e) {
    e.preventDefault(); var f = e.target, em = f.le.value.trim(), pw = f.lp.value;
    if (Date.now() < lockUntil) return setMsg(f, 'err', 'locked');
    if (!em || !pw) return setMsg(f, 'err', 'missing');
    busy(f, true);
    try {
      var r = await sb.auth.signInWithPassword({ email: em, password: pw });
      if (r.error) { var now = Date.now(); fails = fails.filter(function (x) { return now - x < 60000; }); fails.push(now); if (fails.length >= 5) { lockUntil = now + 30000; fails = []; } setMsg(f, 'err', errKey(r.error)); }
      else { f.reset(); fails = []; session = r.data.session; go('#account'); }
    } catch (x) { setMsg(f, 'err', 'network'); } finally { busy(f, false); }
  }
  async function doForgot(e) {
    e.preventDefault(); var f = e.target, em = f.fe.value.trim(); if (!em) return setMsg(f, 'err', 'missing');
    busy(f, true);
    try {
      markRecovery();
      var r = await sb.auth.resetPasswordForEmail(em, { redirectTo: location.origin + '/' }), k = r.error ? errKey(r.error) : 'sent';
      setMsg(f, (k === 'sent' || k === 'generic' || k === 'cred') ? 'good' : 'err', (k === 'sent' || k === 'generic' || k === 'cred') ? 'sent' : k);
    } catch (x) { setMsg(f, 'err', 'network'); } finally { busy(f, false); }
  }
  async function doConfirm(e) {
    e.preventDefault(); var f = e.target; if (!pending) return; busy(f, true);
    try {
      var r = await sb.auth.verifyOtp({ token_hash: pending.th, type: pending.ty });
      if (r.error || !r.data || !r.data.session) { setMsg(f, 'err', r.error ? errKey(r.error) : 'expired'); }
      else { var t2 = pending.ty; pending = null; session = r.data.session; go(t2 === 'invite' || t2 === 'recovery' ? '#reset' : '#account'); }
    } catch (x) { setMsg(f, 'err', 'network'); } finally { busy(f, false); }
  }
  async function doSetPw(e) {
    e.preventDefault(); var f = e.target, a = f.p1.value, b = f.p2.value;
    if (!a || !b) return setMsg(f, 'err', 'missing'); if (a.length < MIN_PW) return setMsg(f, 'err', 'short'); if (a !== b) return setMsg(f, 'err', 'nomatch');
    busy(f, true);
    try {
      var r = await sb.auth.updateUser({ password: a });
      if (r.error) setMsg(f, 'err', errKey(r.error)); else { f.reset(); setFlash('pwset', 'account'); go('#account'); }
    } catch (x) { setMsg(f, 'err', 'network'); } finally { busy(f, false); }
  }
  async function doLogout() {
    var b = Q('#lo'); if (b) b.disabled = true;
    try { var r = await sb.auth.signOut(); if (r && r.error) await sb.auth.signOut({ scope: 'local' }); } catch (x) { try { await sb.auth.signOut({ scope: 'local' }); } catch (y) { } }
    session = null; mode = 'login'; setFlash('loggedout', 'login'); go('#login');
  }
  async function doAcctReset() {
    var f = Q('#account .card'), em = session && session.user && session.user.email; if (!em) return;
    try { markRecovery(); var r = await sb.auth.resetPasswordForEmail(em, { redirectTo: location.origin + '/' }); setMsg(f, r.error && errKey(r.error) === 'rate' ? 'err' : 'good', r.error && errKey(r.error) === 'rate' ? 'rate' : 'sent'); } catch (x) { setMsg(f, 'err', 'network'); }
  }

  /* ---------- guards, titles, events ---------- */
  var TITLES = { login: ['Log in', 'Connexion'], account: ['Account', 'Mon compte'], reset: ['Choose your password', 'Choisissez votre mot de passe'], confirm: ['Confirm', 'Confirmation'] };
  function guard() {
    var h = cur();
    if (h === 'account' && ready && !session && reason === 'ok') { setFlash(flash || 'needlogin', 'login'); go('#login'); }
    else if (h === 'login' && ready && session && mode === 'login') go('#account');
    else if (h === 'reset' && ready && !session && reason === 'ok') go('#login');
    else if (h === 'confirm' && !pending) go('#login');
    else if (TITLES[h]) document.title = T(TITLES[h]) + ' · Project Edge';
  }
  addEventListener('hashchange', function () {
    /* Safety net: if tokens/errors ever arrive via a hash-only navigation (the head script only runs on page load), remove them and discard them. */
    if (/(^#|&)(access_token|refresh_token|error_code|error)=/.test(location.hash)) { history.replaceState(null, '', location.pathname + '#login'); setFlash('linkerr', 'login'); go('#login'); return; }
    if (cur() !== 'login') mode = 'login'; guard(); paint(); if (flash && cur() !== flashPage) flash = '';
  });

  var _ra = render;
  render = function () { _ra(); paint(); };

  /* Consume a Supabase email link (default templates). Tokens only ever live in memory and are verified with the Supabase server. */
  async function consumeLink() {
    var ty = null;
    try {
      var r, u;
      if (linkTokens) {
        var x = linkTokens; linkTokens = null; ty = x.ty;
        r = await sb.auth.setSession({ access_token: x.at, refresh_token: x.rt }); x.at = x.rt = null;
        if (r.error || !r.data || !r.data.session) throw r.error || new Error('no session');
      } else if (linkCode) {
        var c = linkCode; linkCode = null;
        r = await sb.auth.exchangeCodeForSession(c);
        if (r.error || !r.data || !r.data.session) throw r.error || new Error('no session');
        ty = (takeRecovery() || /recovery/i.test(String((r.data && r.data.redirectType) || ''))) ? 'recovery' : 'login';
      }
      u = await sb.auth.getUser(); /* asks the Supabase server whether the token is genuine */
      if (u.error || !u.data || !u.data.user) { try { await sb.auth.signOut({ scope: 'local' }); } catch (e2) { } throw u.error || new Error('no user'); }
      session = r.data.session; verifying = false;
      go(ty === 'invite' || ty === 'recovery' ? '#reset' : '#account');
    } catch (err) {
      verifying = false; session = null;
      setFlash(errKey(err) === 'pkce' ? 'pkce' : 'linkerr', 'login'); go('#login');
    }
  }

  if (reason === 'ok') {
    sb = window.supabase.createClient(String(C.SUPABASE_URL).trim().replace(/\/+$/, ''), String(C.SUPABASE_PUBLISHABLE_KEY).trim(), { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' } });
    var A = sb && sb.auth;
    if (!A || typeof A.setSession !== 'function' || typeof A.exchangeCodeForSession !== 'function' || typeof A.verifyOtp !== 'function' || typeof A.getUser !== 'function') { reason = 'nolib'; sb = null; verifying = false; ready = true; }
    else {
      A.onAuthStateChange(function (ev, s) { session = s || null; setTimeout(function () { if (ev === 'PASSWORD_RECOVERY') go('#reset'); paint(); }, 0); });
      A.getSession().then(async function (r) {
        session = (r && r.data && r.data.session) || null;
        if (linkTokens || linkCode) { await consumeLink(); }
        ready = true; guard(); paint();
      }).catch(function () { verifying = false; ready = true; guard(); paint(); });
    }
  } else { linkTokens = null; linkCode = null; verifying = false; ready = true; }
  if (pending && reason === 'ok') go('#confirm');
  paint(); guard();
})();

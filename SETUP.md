# Project Edge — Authentication Phase 1 (development / testing build)

Nothing here has been published. Your live site does not change until YOU upload these files to
GitHub and merge them. Public registration stays disabled. This build supports Supabase's
**default** invitation and password-reset emails, for development and testing only.

## Files

| File | Purpose | Edit? |
|---|---|---|
| `index.html` | Your whole site (12 pages, animations, FR/EN) + log-in, account, invitation and password screens. A tiny script at the very top of `<head>` removes link tokens from the address bar. | No |
| `auth.js` | All sign-in logic. | No |
| `config.js` | Your Project URL and publishable key. | **Yes** |
| `vendor/supabase.js` | Official Supabase library, saved in your repo. | **You add it** (see `vendor/README.md`) |
| `vercel.json` | Security headers. | No |

## 1. Supabase settings

1. **Authentication → URL Configuration**: Site URL `https://project-edge-website.vercel.app` (no slash at the end).
   Redirect URLs: add `https://project-edge-website.vercel.app/**`.
2. **Authentication → Sign In / Providers → Email**: "Confirm email" ON; **"Allow new users to sign up" OFF**;
   minimum password length **10**; "Email OTP expiration" lowered (for example **900** seconds).
3. Leave the **default email templates** as they are. Do **not** enable CAPTCHA yet (this build does not send
   a CAPTCHA token, so it would block log-ins). Do not enable Google or Apple yet.
4. Built-in email limits: Supabase's default sender is heavily rate-limited and may only deliver to addresses
   on your Supabase organization. Use such an address for the invitation and reset tests.

## 2. Keys and library

- Project Settings → API Keys: copy the **Project URL** and the **publishable key** (`sb_publishable_…`) into
  `config.js` in your own repository (not into a chat). Never use a secret key (`sb_secret_…`) or a `service_role`
  key: if one is detected, sign-in switches itself off.
- Add `vendor/supabase.js` by following `vendor/README.md` (pinned version, ideally one published at least 14 days ago).

## 3. Deploy through GitHub and Vercel (you stay in control)

1. GitHub → `projectedgeca/project-edge-website` → create branch `auth-phase1`.
2. On that branch: Add file → Upload files: `index.html`, `auth.js`, `config.js`, `vercel.json`, and `vendor/…`. Commit to the branch (not main).
3. Open the Vercel Preview of the branch and check the site and `#login` look normal.
4. When you are happy, open a Pull Request and **merge** it. Invitation and reset links always return to the Site URL
   from step 1, so the real email tests must happen after the merge.
5. Roll back anytime: Vercel → Deployments → previous deployment → Promote / Instant Rollback.
   If the site looks wrong after adding `vercel.json`, delete that file and redeploy.

## 4. Test in this order (on the deployed site)

**Test A — manual test account (no email involved, do this first).**
Supabase → Authentication → Users → Add user → **Create new user**; enter an email and a temporary password
(10+ characters) and tick **Auto Confirm User**. Then on your site:
- [ ] `/#login`: log in with it → you land on **Your account** showing the email
- [ ] Refresh: still logged in. Private window: not logged in
- [ ] Log out → back on the log-in page, "You have been logged out."
- [ ] Wrong password → only "Incorrect email or password."
- [ ] `/#account` while logged out → sent to the log-in page
- [ ] Everything also in French (FR button); browser console (F12) shows no red errors
- [ ] No "create account"/"sign up" option anywhere

**Test B — invitation with the default email.** Authentication → Users → Add user → **Send invitation**
(use an organization-member address). Open the email **in a normal inbox, right away**.
- [ ] The link opens your site; the address bar shows no long token (just `#login`/`#reset`)
- [ ] You see "Choose your password"; short or mismatched passwords are refused
- [ ] After saving, you see Your account; logging out and back in with the new password works
- [ ] Opening the same link a second time shows "This link is invalid or has expired" (expected)

**Test C — password reset with the default email.** On the log-in page choose "Forgot your password?".
- [ ] The page always says "If an account exists…" (it never reveals whether an address exists)
- [ ] Open the email link **in the same browser you asked from** → "Choose your password" → saved → Your account
- [ ] Opening the link on another device/browser shows "must be opened in the same browser…" (expected)

## 5. Security limitations of the default emails (why this is for testing only)

- The invitation link contains a live login for that account in the part after the `#`. Anyone or any system that
  can see the email or the link before it is used (a company mail scanner, forwarding, mail logs) could use it.
  Invite only to personal inboxes, open the email immediately, and delete it afterwards.
- Mail scanners that open links can use up a link (false "expired" errors): just resend.
- Tokens are not sent to any server in the `#` part, but exist in the address bar for a split second until the
  top-of-page script removes them (before any other script runs). Browser extensions could still see them.
- There is no "Continue" button safeguard (that needs custom templates).
- Password-reset links use the stricter PKCE method (a one-time code that only works in the browser that asked).
- The browser keeps your session in local storage until you log out or it expires; XSS protection therefore matters
  (the site never inserts user text as HTML, and `vercel.json` adds a content-security policy).
- **Before real users:** set up custom SMTP and your own templates (the `token_hash` flow is still built in and
  switches on automatically when links use `?token_hash=…&type=…`; use the template text in the previous guide:
  `{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=invite` or `…&type=recovery`).

## 6. What was verified, and what was not

Checked against the **official Supabase library source** (GitHub `supabase-js` / `auth-js`):
- With `flowType: 'pkce'`, the library refuses implicit-grant URLs ("Not a valid PKCE flow url"), so default invitation
  links cannot be handled by the library in PKCE mode. That is why this build reads the tokens itself.
- Default flow type is "implicit"; `detectSessionInUrl` accepts true/false (or a function).
- A `?code=` link only works if the same browser stored a code verifier; the exchange then returns the session.
- `setSession` verifies with the server (it calls `getUser`); this build also calls `getUser()` explicitly.
- Recovery flows store the verifier with a `/PASSWORD_RECOVERY` marker, which the exchange returns as `redirectType`.

Tested here only against a **stand-in** for the library (28 invitation/reset/link-error tests + 32 earlier tests, all
passing; whole site rechecked at 7 widths in both languages). That proves the screens and logic, **not** real
authentication. **Not tested:** real Supabase log-in, real emails, redirects, Vercel headers, real phones, and the exact
library file you will download. Do not treat the log-in as secure or working until Tests A–C pass on your deployed site.

## 7. Privacy and legal (drafts, before public launch)

The Privacy Policy, Legal Notice and Terms (EN/FR) mention log-in for invited users, Supabase (United States, West US,
Oregon) and Vercel. A Québec lawyer must review them. To confirm: email-sending provider, retention periods, deletion
process, cross-border wording, and any storage/cookie notice.

## Next (not started)

Phase 2: CAPTCHA, change-password in the account page, custom SMTP and templates. Phase 3: Google, then Apple.

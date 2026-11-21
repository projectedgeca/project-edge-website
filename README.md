# vendor/supabase.js  (you add this file)

The official Supabase JavaScript library, saved locally so the site does not
load code from a third-party server.

1. Open https://www.npmjs.com/package/@supabase/supabase-js?activeTab=versions
   and pick the newest stable version that was published at least 14 days ago.
   Write it in VERSION.txt (one line, e.g. 2.119.0).
2. Open this address in your browser, replacing X.Y.Z with that version:
   https://cdn.jsdelivr.net/npm/@supabase/supabase-js@X.Y.Z/dist/umd/supabase.js
3. Save the page as `supabase.js` (Ctrl/Cmd+S, "Page source" / "Text file") and
   upload it to this folder (vendor/supabase.js) in GitHub.
4. Check the first line of the file mentions supabase and the file is about
   100-200 KB. Do not edit it.

To upgrade later, repeat these steps with a newer version and update VERSION.txt.

## Optional: confirm the file is the real library
After saving `supabase.js`, open it in a text editor and use Find to check that these exact words appear:
`exchangeCodeForSession`, `setSession`, `Not a valid PKCE flow url`. If any is missing, the download
is wrong (or very different): re-download it. The site also checks at run time and disables sign-in
with a clear message if a needed function is missing.

# Security

## Reporting a vulnerability

Please report security problems privately: open the repository's **Security** tab and choose
**Report a vulnerability** (GitHub private vulnerability reporting). Do not open a public issue,
and never attach real bank statements; describe the problem or build a small fake file instead.

You should get an answer within a week. This is a spare-time project, so fixes come on a
best-effort basis, but anything that can expose someone's statements comes first.

## What matters here

The dashboard is a single HTML page that reads bank statements in the browser. The things worth
reporting are the ones that break that promise:

- anything that makes the page send data anywhere, or load code from anywhere;
- a crafted statement, rules or overrides file that runs script or code in the page;
- ways for other pages to read the stored transactions beyond what the README describes;
- problems in the build or the GitHub Pages deployment that could ship modified code.

## What is already known

- In Chrome and Edge, all `file://` pages share one storage area. The README explains this and
  the **Don't remember on this device** setting avoids it.
- The page carries a Content Security Policy that blocks every network request and every script
  that is not part of the build.

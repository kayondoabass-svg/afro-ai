# Backend-managed email confirmation

This example runs on the **customer's own backend**, not inside an iframe and
not as a browser call using an API secret. It does not assume an undeclared
database model or delete sessions using an email from a URL.

## Configure once

1. In Afro Auth, verify ownership of the customer website and save its exact
   HTTPS origin under Settings.
2. Install `express` and `cookie` in the customer backend.
3. Add the following **server-only** environment variables:

   ```text
   AFRO_AUTH_BASE_URL=https://afroaigroup.com/cf-auth/v1/t/YOUR_PROJECT_SLUG
   AFRO_AUTH_SECRET_KEY=YOUR_EXISTING_PROJECT_SECRET_KEY
   AFRO_CALLBACK_URL=https://YOUR_VERIFIED_WEBSITE/auth/confirm
   AFRO_COOKIE_SECRET=YOUR_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS
   ```

4. Mount `createAfroAuthRouter` from `server.mjs` at your Express app's root,
   or run that file directly behind your HTTPS reverse proxy.
5. In the project's Setup, save the **same exact callback URL** under Backend
   confirmation handoff. Saving this URL does not deploy the customer's server.

Every customer uses their own verified website hostname, project slug and
private API key. No customer name or domain is hard-coded into the integration.

## Default server-rendered callback

Submit the customer's signup form to `POST /auth/signup` with JSON
`{email,password}`. Show the returned "check your email" message.

The email points to the customer's registered callback. GET renders a
customer-domain confirmation form without activating the account. The visitor's
POST performs all Afro Auth verification and exchange calls behind the scenes,
expires the pending cookie and transaction, sets a fresh encrypted, host-only
HttpOnly session cookie, then redirects to `/dashboard?verified=true`.

## React callback page

Mount the backend with `renderCallback:false`. Have your frontend router render
`CallbackPage.jsx` at the registered callback path; POST on that path must still
reach the backend. The component:

- strips action values from browser history;
- calls only the same-origin customer backend;
- confirms after the page is visible, never inside an iframe;
- handles React Strict Mode without issuing a second exchange;
- receives only `{ok,redirect}`, never an API secret or login token.

Your SPA's normal CSP must allow its own scripts and same-origin API requests.
Apply `frame-ancestors 'none'` to the callback page at your web server.
The sample limits signup attempts per visitor IP. Configure Express's trusted
proxy only for your actual proxy address/CIDR; otherwise all visitors behind a
proxy may share one limit. For multiple server instances, replace this in-memory
limiter with your application's shared limiter or WAF policy.

## Session behavior and boundaries

- The first signup ID is a pending transaction, **not** permission to access
  protected data. Only a verified exchange creates an authenticated session.
- The one-use exchange code expires after two minutes and requires the private
  project key, the original backend-held PKCE verifier, state and exact callback.
- Confirmation consumes the pending transaction. A supplied previous session for
  that same project/user is revoked; unrelated users and devices are untouched.
- The example's browser cookie is encrypted and HttpOnly, not a plaintext JWT
  exposed to JavaScript. `GET /auth/session` validates it against Afro Auth.
- `POST /auth/logout` revokes the service session before clearing local cookies.
- Opening the email in another browser/device cannot silently log it into the
  original browser's account. Return to the original browser or sign in normally.
- If a response is lost after the one-use exchange, use normal login; do not
  retry signup repeatedly or create replacement users/keys.
- If your app already has its own session database, integrate its session
  creation/revocation at the callback instead of maintaining two auth systems.
  Scope cleanup by the validated project/user and transaction ID, never a query
  string email. This example does not migrate or replace an existing database.
- Existing legacy integrations remain manual until their owner installs and
  enables this backend flow. No iframe is required in either mode.

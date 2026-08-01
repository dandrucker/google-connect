# google-connect

Headless Google API access for personal projects — **Sheets, Calendar, Tasks, and Gmail**.

You authorize **once**. Every project after that just needs three environment
variables and it works forever, with no login page, no cookies, and no session
to expire.

```
ONE TIME    local CLI  ->  Google consent screen  ->  refresh token
EVERY APP   refresh token (env var)  ->  auto-renewed access tokens  ->  APIs
```

> **Google Keep is not supported, and cannot be.** The Keep API is restricted to
> Google Workspace *enterprise* accounts for admin security tooling. A personal
> `@gmail.com` account cannot use it under any configuration. Use **Tasks**
> instead — it is the closest equivalent and works fully on personal accounts.

---

## Part 1 — One-time Google Cloud setup

Do this once, ever. Every future project reuses the result.

### Step 1. Open your project

Go to <https://console.cloud.google.com/> and select your existing project
(the one your current client ID belongs to), or create a new one.

### Step 2. Enable the APIs you want

Go to **<https://console.cloud.google.com/apis/library>**, then search for and
click **Enable** on each:

| API | Needed for |
|---|---|
| Google Sheets API | reading/writing spreadsheets |
| Google Calendar API | events |
| Google Tasks API | task lists (the Keep replacement) |
| Gmail API | sending mail |

Enabling an API you never call costs nothing, so enable all four now and avoid
coming back later.

### Step 3. Set the consent screen to "In production" — do not skip this

Google moved this out of *APIs & Services* into a section called
**Google Auth Platform**. The menu path is easy to miss, so go straight there:

> **<https://console.cloud.google.com/auth/audience>**

Check the project name in the top bar first — the console loves defaulting to
the wrong project.

**If the page asks you to configure Google Auth Platform**, do that first:
- **App name:** anything (e.g. "Personal Automation")
- **User support email:** your own address
- **Audience:** **External** — this is the only option for a personal
  `@gmail.com` account. "Internal" requires Google Workspace and will be greyed
  out. External here does *not* mean the app is public.
- **Contact email:** your own address, then agree and create

**Then, on the Audience page**, find the **Publishing status** panel:
- If it reads **Testing**, click **Publish app**
- A "Push to Production?" dialog appears — click **Confirm**
- It should now read **In production**

You can ignore the **Test users** list entirely once published — it only
applies to Testing status.

**Why this matters more than anything else on this page.** Google's OAuth docs
state that an External app left in **Testing** status issues refresh tokens that
**expire after 7 days**. Testing is the default, and nothing warns you. If you
skip this step, everything below will work perfectly — and then silently break
next week, in every project.

You do *not* need Google's app verification. An unverified production app still
works for its owner; it is capped at 100 users, which is irrelevant when the
only user is you. As the owner you will see an **"Google hasn't verified this
app"** warning during Step 6 — click **Advanced → Go to (app name) (unsafe)**
and continue. That warning is expected and harmless here: you are the developer,
the user, and the reviewer.

### Step 4. Add the redirect URI

Go to **<https://console.cloud.google.com/auth/clients>** and click your
**OAuth 2.0 Client ID** (create one of type **Web application** if you don't
have it).

Under **Authorized redirect URIs**, add exactly:

```
http://localhost:5555/oauth2callback
```

Click **Save**. This is only used by the authorize CLI on your own machine —
your deployed apps never redirect anywhere, which is the whole point of the
refresh-token approach.

> Changes to redirect URIs can take a few minutes to propagate. If Step 6 fails
> with `redirect_uri_mismatch`, wait a minute and retry.

### Step 5. Note your client ID and secret

From that same Credentials page, copy the **Client ID** and **Client secret**.

---

## Part 2 — Mint your refresh token

### Step 6. Run the authorize command

In any project folder that has a `.env.local` with your client id and secret —
or with the variables set in your shell — run:

```bash
npx google-connect authorize
```

It opens your browser, catches the redirect on `localhost:5555`, and prints:

```
GOOGLE_REFRESH_TOKEN=1//0gWq...
```

Request narrower access with `--scopes`:

```bash
npx google-connect authorize --scopes SHEETS,CALENDAR
```

Available groups: `SHEETS`, `SHEETS_READONLY`, `CALENDAR`, `CALENDAR_READONLY`,
`TASKS`, `GMAIL_SEND`, `DRIVE_FILE`. Default is `SHEETS,CALENDAR,TASKS,GMAIL_SEND`.

### Step 7. Store the three variables

Put them in each project's `.env.local` (and in your host's environment
variable settings when you deploy):

```
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxx
GOOGLE_REFRESH_TOKEN=1//0gWq...
```

Confirm it works at any time:

```bash
npx google-connect verify
```

---

## Part 3 — Use it in a project

### Install

```bash
npm install git+https://github.com/dandrucker/google-connect.git
```

Use the explicit `git+https://` form rather than the `github:` shorthand. Both
work locally, but the https form is unambiguous in CI where no SSH key exists.

The package builds itself on install, so no separate build step is needed.

### Sheets

```ts
import { sheets } from 'google-connect';

// Create the tab and header row if the spreadsheet is blank
await sheets.ensureSheet(SHEET_ID, 'Log', ['Date', 'Item', 'Notes']);

await sheets.appendRow(SHEET_ID, ['2026-08-01', 'Squats', '5x5 @ 185'], {
  sheetName: 'Log',
});

const rows = await sheets.readRange(SHEET_ID, 'Log!A:C');
```

`SHEET_ID` accepts either the bare id or the full browser URL.

### Calendar

```ts
import { calendar } from 'google-connect';

const today = await calendar.listTodayEvents();

await calendar.createEvent({
  summary: 'Garage workout',
  start: new Date('2026-08-02T06:00:00'),
  end: new Date('2026-08-02T06:45:00'),
});
```

### Tasks

```ts
import { tasks } from 'google-connect';

await tasks.addTask('Order more chalk', { notes: 'the good stuff' });
const open = await tasks.listTasks();
```

### Gmail

```ts
import { gmail } from 'google-connect';

await gmail.sendMail({
  to: 'someone@example.com',
  subject: 'Weekly summary',
  text: 'Four workouts logged this week.',
});
```

---

## Sharing a spreadsheet or calendar

Because this library acts **as you**, anything your Google account can already
see is available. There is nothing to share with a service account and no
special permissions to grant — a common source of confusion with the
service-account approach.

## Security notes

- The refresh token grants everything you approved. Treat it like a password.
- Never commit `.env.local`. The included `.gitignore` covers it.
- Revoke access any time at <https://myaccount.google.com/permissions>.
  Revoking invalidates the refresh token everywhere; re-run `authorize` after.
- Prefer narrow scopes per project. An app that only logs workouts should be
  authorized with `--scopes SHEETS`, not the full default set.

## When tokens stop working

| Symptom | Cause | Fix |
|---|---|---|
| Worked for a week, then `invalid_grant` | Consent screen still in **Testing** | Publish the app (Step 3), re-run `authorize` |
| Broke right after a password change | Any Gmail scope invalidates tokens on password reset | Re-run `authorize` |
| `redirect_uri_mismatch` | URI missing or still propagating | Verify Step 4, wait a minute |
| No refresh token returned | App was already authorized | Revoke at myaccount.google.com/permissions, retry |
| Unused for 6 months | Google expires idle refresh tokens | Re-run `authorize` |

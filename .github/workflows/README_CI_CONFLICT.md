# CI decision needed: two workflows deploy to different places

`ci.yml` and `backend-ci.yml` both trigger on push to `main` and both
build + deploy — but to genuinely different infrastructure:

| | `ci.yml` | `backend-ci.yml` |
|---|---|---|
| Backend deploy | SSH into a server, `git pull` + `pm2 reload` + `nginx -s reload` | `railway up --service backend` |
| Frontend deploy | Same SSH box (implied — serves `frontend/dist` via that nginx) | `vercel --prod` |
| Trigger | `push: [main]` | `push: [main, develop]` |

If both are enabled on GitHub right now, **every push to `main` fires both
deploys at once** — a self-hosted VPS deploy and a Railway/Vercel deploy,
completely independent of each other. Whichever one finishes last "wins"
for where your live traffic effectively points, and the other one is
silently deploying to infrastructure nobody's looking at.

I didn't guess which one is real — only you know whether this app is
actually running on a VPS behind nginx+PM2, or on Railway/Vercel.

**What to do:**
1. Check which URL your users actually hit (`smartnyumba.com` DNS record,
   or just ask "where did I last deploy this") to see which target is real.
2. Delete the workflow file for the deploy path you're *not* using.
3. `frontend-ci.yml` (build + lint + Playwright e2e, no deploy step) is
   fine to keep either way — it doesn't touch either deploy target, it just
   overlaps with the `frontend` build job inside whichever `*-ci.yml` you
   keep. Once you've picked one, you may want to fold its build/lint steps
   into `frontend-ci.yml` and drop them from the other file, so build logic
   lives in exactly one place.

Delete this file once you've resolved it.

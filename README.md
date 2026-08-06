# SMB SSO bridge (`smb-app`)

Temporary login + tenant/company bootstrap + one-time SSO handoff into AI Studio.

This is **not** the real SMB product UI. Deploy it on its own Vercel project so it can talk to:

**AI Studio:** https://ai-stduio-brain-space.vercel.app  
**This bridge (Vercel):** https://smb-app-test.vercel.app

## Local

```bash
npm install
cp .env.example .env.local   # fill secrets
npm run dev                  # http://localhost:3000
```

## Deploy on Vercel (second project)

1. Push this folder to its **own** GitHub repo (not the BrainSpace repo).
2. Import that repo in Vercel (Root Directory = `.`).
3. Set env vars (Production), then deploy.

| Variable | Example |
| --- | --- |
| `SMB_API_BASE` | `https://api.kob.sinam.az` |
| `AI_STUDIO_URL` | `https://ai-stduio-brain-space.vercel.app` |
| `HANDOFF_SECRET` | same long secret as AI Studio |
| `UPSTASH_REDIS_REST_URL` | from Upstash Redis |
| `UPSTASH_REDIS_REST_TOKEN` | from Upstash Redis |

4. Production URL: https://smb-app-test.vercel.app
5. On **AI Studio** Vercel project set:
   - `SMB_APP_URL` = `https://smb-app-test.vercel.app`
   - `HANDOFF_SECRET` = same secret  
   - `OPENROUTER_API_KEY`, `SMB_API_BASE`, etc.  
   - Redeploy Studio

## Test

1. Open https://smb-app-test.vercel.app → login with real SMB user  
2. Select tenant + company  
3. **Open AI Studio** → should land on Studio workspace (not `/welcome?sso=failed`)

## SSO contract

`POST /api/handoff/create` (browser, session) → `{ url }`  
`POST /api/handoff/consume` (Studio server, `x-handoff-secret`) → tokens  

Same contract the real SMB app will implement later.

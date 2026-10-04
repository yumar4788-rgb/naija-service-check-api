# Naija Service Check – backend (simple steps)

## What this backend does
It answers the page's Verify forms using a **verified-records database you control** (the JSON files in `data/`).
It does NOT scrape CAC or NAFDAC. Records are what your team has checked and entered. The data shipped here is **sample only: replace it**.

## A. Run it on your computer (5 minutes)
1. Install Node.js 18 or newer (nodejs.org).
2. Open a terminal in this folder (`ncs-backend`).
3. Run: `ADMIN_KEY=choose-a-long-secret node server.js`  (Windows PowerShell: `$env:ADMIN_KEY="choose-a-long-secret"; node server.js`)
4. Test in a browser: http://localhost:3000/health  then  http://localhost:3000/v1/verify/nafdac?q=A0-0000

## B. Put it online (free tier hosts such as Render or Railway)
1. Upload this folder to a GitHub repository.
2. On the host, create a new "Web Service" from that repository.
3. Build command: leave empty. Start command: `node server.js`
4. Add environment variables: `ADMIN_KEY` (your secret) and `ALLOWED_ORIGIN` (your website address, e.g. https://naijaservicecheck.ng).
5. Copy the public address the host gives you, e.g. https://ncs-api.onrender.com
6. Note: free hosts may reset files on restart. For permanent data, attach a disk or later move records to a database.

## C. Connect the website to it
1. Open `naija-service-check.html` in a text editor.
2. Find the line `var API='';`
3. Change it to `var API='https://ncs-api.onrender.com/v1';` (your address + `/v1`)
4. Upload the HTML file to your own hosting. The claude.ai-hosted copy cannot call outside servers.
5. Open the site, go to Verify, and try `A0-0000` under NAFDAC. You should see a result from the API.

## D. Add real records (your admin job)
Only add records you have personally checked on the official source.
```
curl -X POST https://YOUR-API/v1/admin/organisations \
  -H "x-api-key: YOUR_SECRET" -H "Content-Type: application/json" \
  -d '{"name":"ABC Nigeria Ltd","rc":"RC 123456","state":"Rivers","status":"Active","source":"CAC","url":"<link to the official record>","checked":"2026-10-04"}'
```
Collections: `organisations`, `nafdac` (number,name,applicant,category,status,source,url,checked), `domains` (org,domain,url,checked), `warnings` (org,date,issue,match[],url).
Records older than 180 days are flagged "may need to be refreshed" (change with `STALE_DAYS`).

## E. The API contract in one glance
`GET /v1/verify/{company|nafdac|site|job|reg}?q=TEXT[&id=CHOICE]` returns JSON with `status` (g,b,y,o,r), `claim`, `source`, `lastChecked`, `matches`, `mismatches`, `summary`. See `../api-contract.md`.
Special replies: `{"candidates":[...]}` (several matches) and `{"error":"unavailable"}`.

## Before public launch
Add rate limiting, HTTPS only, a real database, and a privacy notice (queries are logged to the server console).

## F. Admin dashboard (no more curl)
1. Upload `admin.html` to your hosting, on a private address (e.g. admin.yoursite.ng).
2. Open it and sign in with your API address (with `/v1`), your name and the `ADMIN_KEY`.
3. Use the left menu: Dashboard (counts and records due for review), Organisations, NAFDAC Checks, Verification Sources, Scam & Recruitment Alerts, Audit Log.
4. Add, edit or delete records. Each record keeps its source link, date checked, who checked it, and a next-review date (180 days).
5. Every change is written to the Audit Log. Use HTTPS only, keep the key secret, and share it only with trusted staff.

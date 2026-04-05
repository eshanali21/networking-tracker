# Networking Spreadsheet — Setup Guide

One-time setup (~45 min). After this, just open the app on your iPhone and talk.

---

## What you'll need
- A GitHub account (free)
- A Google account (for Sheets + AI Studio)
- A Vercel account (free) — vercel.com

---

## Step 1 — Get your Gemini API Key (free)

1. Go to **https://aistudio.google.com/apikey**
2. Sign in with your Google account
3. Click **"Create API Key"** → select any project (or create one)
4. Copy the key — save it somewhere safe

---

## Step 2 — Create Google Sheet + Service Account

### 2a. Enable the Sheets API
1. Go to **https://console.cloud.google.com/**
2. Create a new project (name it anything, e.g. "networking-app")
3. In the search bar, search **"Google Sheets API"** → click it → click **Enable**

### 2b. Create a Service Account
1. In Google Cloud Console, go to **IAM & Admin → Service Accounts**
2. Click **"Create Service Account"**
   - Name: `networking-app` (anything works)
   - Click **Create and Continue** → skip the optional steps → click **Done**
3. Click on the new service account → go to the **Keys** tab
4. Click **Add Key → Create new key → JSON** → it downloads a `.json` file
5. Open that file in a text editor — copy the **entire contents**

### 2c. Create your Google Sheet
1. Go to **https://sheets.google.com** → create a **blank spreadsheet**
2. Name it "My Network" (or anything you like)
3. Look at the URL — it looks like:
   `https://docs.google.com/spreadsheets/d/XXXXXXXXXXXXXXXXXXXXXXXX/edit`
   Copy that long ID between `/d/` and `/edit` — that's your **Spreadsheet ID**
4. Add a sheet tab named exactly **`Contacts`** (click the `+` at the bottom left, rename it)
5. **Share the sheet** with your service account:
   - Click **Share** (top right)
   - Paste the service account email (from the JSON file, it looks like `xyz@your-project.iam.gserviceaccount.com`)
   - Set role to **Editor** → click Share

---

## Step 3 — Deploy to Vercel

### 3a. Push code to GitHub
1. Create a new **private** GitHub repository
2. Push all these files to it:
   ```
   git init
   git add .
   git commit -m "initial"
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```

### 3b. Deploy on Vercel
1. Go to **https://vercel.com** → sign in with GitHub
2. Click **"Add New Project"** → import your repo
3. Click **"Environment Variables"** and add these 3:

   | Name | Value |
   |------|-------|
   | `GEMINI_API_KEY` | The key from Step 1 |
   | `GOOGLE_SERVICE_ACCOUNT` | The **entire** JSON file contents (paste as one line or multi-line — Vercel handles both) |
   | `SPREADSHEET_ID` | The ID from Step 2c |

4. Click **Deploy** — wait ~1 minute
5. Vercel gives you a URL like `https://your-project.vercel.app` — that's your app

---

## Step 4 — Add to iPhone Home Screen

1. Open the Vercel URL in **Safari** on your iPhone
2. Tap the **Share button** (box with arrow pointing up)
3. Tap **"Add to Home Screen"**
4. Name it "Network" → tap **Add**

It now lives on your home screen like a native app.

---

## How to use it

1. Open the app
2. Tap the text area → tap the **microphone icon** on your iPhone keyboard
3. Speak naturally — one continuous dump:
   > *"I met Sarah Chen yesterday at the Brown entrepreneurship summit. She's co-founder of a YC startup called Fable, was previously at McKinsey. Her email is sarah@fable.com. I should follow up next week about intro-ing her to my friend at Sequoia."*
4. Tap **Add to Network**
5. If a duplicate is detected, you'll see a side-by-side comparison — tap **Update Existing** or **Add as New**
6. A banner confirms what was added, and flags any missing fields

---

## Columns in your Google Sheet

| Column | Field |
|--------|-------|
| A | Full Name |
| B | Organization |
| C | Role / Title |
| D | How Met (Brown / Consulting / Entrepreneurship / Recruiting / Conference / Other) |
| E | Where Met |
| F | Date Met |
| G | Email |
| H | Phone |
| I | LinkedIn |
| J | Interests |
| K | Notes |
| L | Follow Up? |
| M | Follow Up Notes |
| N | Last Contacted |
| O | Date Added |

---

## Cost

| Service | Cost |
|---------|------|
| Vercel | Free (hobby tier) |
| Gemini 2.0 Flash | Free (1,500 requests/day, 1M tokens/day) |
| Google Sheets API | Free |
| **Total** | **$0/month** |

---

## Troubleshooting

**"SPREADSHEET_ID not configured"** — Check your Vercel env vars, redeploy after adding them.

**"Couldn't extract a name"** — Make sure you mention the person's name in your input.

**Sheet not updating** — Make sure you shared the sheet with the service account email and gave it Editor access.

**Gemini error** — Double-check your GEMINI_API_KEY in Vercel env vars.

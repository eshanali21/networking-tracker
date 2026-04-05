const { GoogleGenerativeAI } = require('@google/generative-ai');
const { google } = require('googleapis');

// ─── Constants ───────────────────────────────────────────────────────────────

const SHEET_NAME = 'Contacts';
const HEADER_ROW = [
  'Full Name', 'Organization', 'Role / Title', 'How Met', 'Where Met',
  'Date Met', 'Email', 'Phone', 'LinkedIn', 'Interests',
  'Notes', 'Follow Up?', 'Follow Up Notes', 'Last Contacted', 'Date Added',
];

// Maps JSON field keys → sheet column index (0-based)
const FIELD_MAP = {
  fullName:       0,
  organization:   1,
  role:           2,
  howMet:         3,
  whereMet:       4,
  dateMet:        5,
  email:          6,
  phone:          7,
  linkedin:       8,
  interests:      9,
  notes:          10,
  followUp:       11,
  followUpNotes:  12,
  lastContacted:  13,
  // dateAdded (14) is auto-set on new entries only
};

const HOW_MET_OPTIONS = ['Brown', 'Consulting', 'Entrepreneurship', 'Recruiting', 'Conference', 'Other'];

// ─── Gemini extraction ────────────────────────────────────────────────────────

async function extractContact(transcript, today) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const prompt = `Today's date is ${today}.

You are a contact extraction assistant. Extract structured information from the following voice transcript and return ONLY a valid JSON object — no prose, no markdown, no code fences.

Fields to extract:
- fullName: string (first + last name)
- organization: string (company, school, or other org)
- role: string (job title, student, founder, etc.)
- howMet: one of exactly these values: ${HOW_MET_OPTIONS.join(' | ')}
  - "Brown" = met through Brown University (events, students, alumni, Brown Career Fair, etc.)
  - "Consulting" = met through consulting (case competitions, consulting club, firm events, etc.)
  - "Entrepreneurship" = met through startups or entrepreneurship (startup events, YC, pitch competitions, etc.)
  - "Recruiting" = met through job recruiting (info sessions, interviews, recruiting events, etc.)
  - "Conference" = met at a conference, summit, or networking event not in above categories
  - "Other" = anything else
- whereMet: string (specific event or place name)
- dateMet: string in YYYY-MM-DD format (infer from relative dates like "yesterday", "last Thursday" using today's date; null if unknown)
- email: string (email address) or null
- phone: string (phone number) or null
- linkedin: string (LinkedIn URL or handle) or null
- interests: string (comma-separated interests, hobbies, passions mentioned) or null
- notes: string (any other relevant context, how they were introduced, things to remember) or null
- followUp: "Yes" or "No" or null (infer from context — if they said "I should follow up", "reach out", "send them X", etc. → "Yes")
- followUpNotes: string (what specifically to follow up about) or null
- lastContacted: string in YYYY-MM-DD format or null

Transcript:
"${transcript.replace(/"/g, '\\"')}"

Return only the JSON object.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  // Strip any accidental markdown fences
  const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(clean);
}

// ─── Google Sheets helpers ────────────────────────────────────────────────────

function getSheetsClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT;
  const creds = typeof raw === 'string' ? JSON.parse(raw) : raw;

  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

async function ensureHeaderRow(sheets, spreadsheetId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A1:O1`,
  });

  const existing = res.data.values?.[0];
  if (!existing || existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADER_ROW] },
    });
  }
}

async function getAllContacts(sheets, spreadsheetId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A2:O`,
  });
  return res.data.values || [];
}

// ─── Fuzzy name matching ──────────────────────────────────────────────────────

function normalizeName(name) {
  return (name || '').toLowerCase().replace(/[^a-z\s]/g, '').trim();
}

function tokenOverlapScore(a, b) {
  const tokensA = new Set(normalizeName(a).split(/\s+/).filter(Boolean));
  const tokensB = new Set(normalizeName(b).split(/\s+/).filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let overlap = 0;
  for (const t of tokensA) { if (tokensB.has(t)) overlap++; }
  return overlap / Math.max(tokensA.size, tokensB.size);
}

function findDuplicate(allRows, newName) {
  let bestScore = 0;
  let bestIndex = -1;

  allRows.forEach((row, i) => {
    const existingName = row[FIELD_MAP.fullName] || '';
    const score = tokenOverlapScore(existingName, newName);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  });

  // 0.6 threshold: matches if most name tokens overlap (handles "John Smith" vs "Smith, John")
  if (bestScore >= 0.6) {
    return { rowIndex: bestIndex + 2, row: allRows[bestIndex] }; // +2: 1-based + header row
  }
  return null;
}

function rowToObject(row) {
  const obj = {};
  Object.entries(FIELD_MAP).forEach(([key, idx]) => {
    obj[key] = row[idx] || null;
  });
  return obj;
}

function objectToRow(extracted, today, isNew) {
  const row = new Array(15).fill('');
  Object.entries(FIELD_MAP).forEach(([key, idx]) => {
    row[idx] = extracted[key] || '';
  });
  if (isNew) row[14] = today; // dateAdded
  return row;
}

function mergeRows(existingRow, extracted) {
  const merged = [...existingRow];
  Object.entries(FIELD_MAP).forEach(([key, idx]) => {
    if (extracted[key]) {
      merged[idx] = extracted[key];
    }
  });
  return merged;
}

function getMissingFields(extracted) {
  const important = ['organization', 'role', 'howMet', 'dateMet', 'email', 'linkedin', 'followUp'];
  const missing = [];
  important.forEach(key => {
    if (!extracted[key]) missing.push(FIELD_MAP[key] !== undefined ? HEADER_ROW[FIELD_MAP[key]] : key);
  });
  return missing;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) return res.status(500).json({ error: 'SPREADSHEET_ID not configured' });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
  if (!process.env.GOOGLE_SERVICE_ACCOUNT) return res.status(500).json({ error: 'GOOGLE_SERVICE_ACCOUNT not configured' });

  const body = req.body;
  const today = body.today || new Date().toISOString().slice(0, 10);

  try {
    const sheets = getSheetsClient();
    await ensureHeaderRow(sheets, spreadsheetId);

    // ── Phase 2: writing after duplicate confirmation ──
    if (body.action && body.extracted) {
      const { action, extracted, rowIndex } = body;
      const allRows = await getAllContacts(sheets, spreadsheetId);

      if (action === 'update' && rowIndex) {
        const existingRow = allRows[rowIndex - 2] || [];
        const mergedRow = mergeRows(existingRow, extracted);
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${SHEET_NAME}!A${rowIndex}:O${rowIndex}`,
          valueInputOption: 'RAW',
          requestBody: { values: [mergedRow] },
        });
      } else {
        // action === 'new' or fallback
        const newRow = objectToRow(extracted, today, true);
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${SHEET_NAME}!A:O`,
          valueInputOption: 'RAW',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: [newRow] },
        });
      }

      return res.status(200).json({
        action,
        name: extracted.fullName || 'Contact',
        missingFields: getMissingFields(extracted),
      });
    }

    // ── Phase 1: extract + duplicate check ──
    const { transcript } = body;
    if (!transcript || typeof transcript !== 'string' || transcript.trim().length === 0) {
      return res.status(400).json({ error: 'transcript is required' });
    }

    const extracted = await extractContact(transcript.trim(), today);

    if (!extracted.fullName) {
      return res.status(422).json({ error: "Couldn't extract a name from your input. Try mentioning their full name." });
    }

    const allRows = await getAllContacts(sheets, spreadsheetId);
    const duplicate = findDuplicate(allRows, extracted.fullName);

    if (duplicate) {
      return res.status(200).json({
        duplicate: true,
        extracted,
        existing: rowToObject(duplicate.row),
        rowIndex: duplicate.rowIndex,
      });
    }

    // No duplicate — write directly
    const newRow = objectToRow(extracted, today, true);
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${SHEET_NAME}!A:O`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [newRow] },
    });

    return res.status(200).json({
      action: 'new',
      name: extracted.fullName,
      missingFields: getMissingFields(extracted),
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

const express   = require('express');
const session   = require('express-session');
const { Pool }  = require('pg');
const path      = require('path');
const crypto    = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', 1);

// ── Database ─────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// ── Admin password (set in Railway env vars) ────────────────────────────────
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'velur-admin-2026';
const SESSION_SECRET  = process.env.SESSION_SECRET  || 'velur-survey-secret-change-this';

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 4 * 60 * 60 * 1000, // 4 hours
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true
  }
}));

const requireAdmin = (req, res, next) => {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'Not authenticated' });
};

// ── Initialize database schema ──────────────────────────────────────────────
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS responses (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMP DEFAULT NOW(),

      respondent_name TEXT,
      response_date    DATE,
      area_office       TEXT,

      -- Electric Diffuser (1-10 ratings)
      ed_noticeable     INTEGER,
      ed_spread         INTEGER,
      ed_inner_reach    INTEGER,
      ed_consistency    INTEGER,
      ed_coverage       INTEGER,
      ed_satisfaction   INTEGER,
      ed_comment        TEXT,

      -- Small Reed Diffuser (1-10 ratings)
      srd_noticeable    INTEGER,
      srd_spread        INTEGER,
      srd_strength_fit  INTEGER,
      srd_persistence   INTEGER,
      srd_satisfaction  INTEGER,
      srd_comment       TEXT,

      -- Big Reed Diffuser (1-10 ratings)
      brd_noticeable    INTEGER,
      brd_spread        INTEGER,
      brd_coverage      INTEGER,
      brd_strength_fit  INTEGER,
      brd_satisfaction  INTEGER,
      brd_comment       TEXT,

      -- General feedback (multiple choice + notes)
      best_product      TEXT,
      needs_improvement TEXT,
      main_observation  TEXT,
      additional_notes  TEXT
    );
  `);
  console.log('Database schema ready.');
}
initDb().catch(e => console.error('DB init error:', e));

// ════════════════════════════════════════════════════════════════
// PUBLIC ROUTES
// ════════════════════════════════════════════════════════════════

app.post('/api/responses', async (req, res) => {
  const d = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO responses
        (respondent_name, response_date, area_office,
         ed_noticeable, ed_spread, ed_inner_reach, ed_consistency, ed_coverage, ed_satisfaction, ed_comment,
         srd_noticeable, srd_spread, srd_strength_fit, srd_persistence, srd_satisfaction, srd_comment,
         brd_noticeable, brd_spread, brd_coverage, brd_strength_fit, brd_satisfaction, brd_comment,
         best_product, needs_improvement, main_observation, additional_notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
       RETURNING id`,
      [
        d.respondent_name, d.response_date || null, d.area_office,
        toInt(d.ed_noticeable), toInt(d.ed_spread), toInt(d.ed_inner_reach), toInt(d.ed_consistency), toInt(d.ed_coverage), toInt(d.ed_satisfaction), d.ed_comment,
        toInt(d.srd_noticeable), toInt(d.srd_spread), toInt(d.srd_strength_fit), toInt(d.srd_persistence), toInt(d.srd_satisfaction), d.srd_comment,
        toInt(d.brd_noticeable), toInt(d.brd_spread), toInt(d.brd_coverage), toInt(d.brd_strength_fit), toInt(d.brd_satisfaction), d.brd_comment,
        d.best_product, d.needs_improvement, d.main_observation, d.additional_notes
      ]
    );
    res.json({ success: true, id: result.rows[0].id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not save response. Please try again.' });
  }
});

function toInt(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

// ════════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ════════════════════════════════════════════════════════════════

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.json({ success: true });
  }
  res.status(401).json({ error: 'Incorrect password' });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/admin/me', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

app.get('/api/admin/responses', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM responses ORDER BY created_at DESC LIMIT 500');
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/summary', requireAdmin, async (req, res) => {
  try {
    const ratingCols = [
      'ed_noticeable','ed_spread','ed_inner_reach','ed_consistency','ed_coverage','ed_satisfaction',
      'srd_noticeable','srd_spread','srd_strength_fit','srd_persistence','srd_satisfaction',
      'brd_noticeable','brd_spread','brd_coverage','brd_strength_fit','brd_satisfaction'
    ];
    const avgSelects = ratingCols.map(c => `ROUND(AVG(${c})::numeric, 2) AS ${c}_avg`).join(', ');
    const countResult = await pool.query('SELECT COUNT(*) AS total FROM responses');
    const avgResult   = await pool.query(`SELECT ${avgSelects} FROM responses`);

    const bestProduct = await pool.query(
      `SELECT best_product, COUNT(*) AS count FROM responses
       WHERE best_product IS NOT NULL AND best_product != ''
       GROUP BY best_product ORDER BY count DESC`
    );
    const needsImprovement = await pool.query(
      `SELECT needs_improvement, COUNT(*) AS count FROM responses
       WHERE needs_improvement IS NOT NULL AND needs_improvement != ''
       GROUP BY needs_improvement ORDER BY count DESC`
    );
    const mainObservation = await pool.query(
      `SELECT main_observation, COUNT(*) AS count FROM responses
       WHERE main_observation IS NOT NULL AND main_observation != ''
       GROUP BY main_observation ORDER BY count DESC`
    );

    res.json({
      total: parseInt(countResult.rows[0].total, 10),
      averages: avgResult.rows[0],
      best_product: bestProduct.rows,
      needs_improvement: needsImprovement.rows,
      main_observation: mainObservation.rows
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/export-csv', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM responses ORDER BY created_at DESC');
    const rows = result.rows;
    if (!rows.length) return res.status(404).send('No data to export.');

    const cols = Object.keys(rows[0]);
    const esc = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const csv = [
      cols.join(','),
      ...rows.map(r => cols.map(c => esc(r[c])).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="velur-scent-survey-responses.csv"');
    res.send(csv);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Admin page route (auth gate handled client-side, page itself is static) ──
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ── Fallback: serve the public survey form for all other routes ────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Velur Scent Survey running on port ${PORT}`);
});

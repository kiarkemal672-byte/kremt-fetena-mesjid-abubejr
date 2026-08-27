/* ═══════════════════════════════════════════════════════════════════════
   مدرسة النور الصيفية القرآنية — الخادم الخلفي (Backend Server)
   Node.js + Express + SQLite (better-sqlite3) + JWT + bcrypt
   ─────────────────────────────────────────────────────────────────────
   الصلاحيات:
     owner   → المشرف العام (kiar): صلاحية مطلقة على كل شيء
     teacher → الأستاذ: طلاب + درجات + اختبارات + أنشطة + قراءات + مشاهدة الكل
   التشغيل:  npm install  ثم  npm start
   ═══════════════════════════════════════════════════════════════════════ */

'use strict';

const path  = require('path');
const fs    = require('fs');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

/* ═════════════════════ 1) الإعدادات العامة ═════════════════════ */
const PORT       = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'nour-summer-secret-CHANGE-ME-in-production';
const JWT_DAYS   = 7;
const DB_FILE    = process.env.DB_FILE || path.join(__dirname, 'nour_school.db');
const PUB_DIR    = path.join(__dirname, 'public');

if (JWT_SECRET.includes('CHANGE-ME')) {
  console.warn('⚠  تحذير: أنشئ متغير بيئة JWT_SECRET بقيمة سرية قبل النشر الحقيقي.');
}

const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '5mb' }));

/* ═════════════════════ 2) قاعدة البيانات والمخطط ═════════════════════ */
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK(role IN ('owner','teacher')),
  subject       TEXT DEFAULT '',
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER
);

CREATE TABLE IF NOT EXISTS students (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  level      TEXT NOT NULL CHECK(level IN ('senior','junior')),
  teacher_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  guardian   TEXT DEFAULT '',
  phone      TEXT DEFAULT '',
  notes      TEXT DEFAULT '',
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS tests (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  subject    TEXT NOT NULL,
  type       TEXT NOT NULL CHECK(type IN ('quran','subject')),
  level      TEXT NOT NULL CHECK(level IN ('senior','junior')),
  max_score  REAL NOT NULL DEFAULT 25 CHECK(max_score > 0),
  date       TEXT NOT NULL,
  created_by TEXT DEFAULT '',
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS scores (
  id          TEXT PRIMARY KEY,
  test_id     TEXT NOT NULL REFERENCES tests(id)    ON DELETE CASCADE,
  student_id  TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  score       REAL NOT NULL CHECK(score >= 0),
  note        TEXT DEFAULT '',
  entered_by  TEXT DEFAULT '',
  updated_at  INTEGER,
  UNIQUE(test_id, student_id)
);

CREATE TABLE IF NOT EXISTS activities (
  id          TEXT PRIMARY KEY,
  section     TEXT NOT NULL CHECK(section IN ('senior','junior')),
  title       TEXT NOT NULL,
  description TEXT DEFAULT '',
  minutes     INTEGER DEFAULT 5,
  sort_order  INTEGER DEFAULT 0,
  created_at  INTEGER
);

CREATE TABLE IF NOT EXISTS activity_participants (
  id          TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  student_id  TEXT REFERENCES students(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS readings (
  id         TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK(kind IN ('z','m','h')),
  surah      TEXT NOT NULL,
  from_ayah  INTEGER NOT NULL CHECK(from_ayah >= 1),
  to_ayah    INTEGER NOT NULL CHECK(to_ayah >= from_ayah),
  ayat_count INTEGER NOT NULL,
  listener   TEXT DEFAULT '',
  date       TEXT NOT NULL,
  note       TEXT DEFAULT '',
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS log (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  at     INTEGER,
  by     TEXT,
  action TEXT
);

CREATE INDEX IF NOT EXISTS idx_scores_student ON scores(student_id);
CREATE INDEX IF NOT EXISTS idx_scores_test    ON scores(test_id);
CREATE INDEX IF NOT EXISTS idx_readings_stu   ON readings(student_id);
CREATE INDEX IF NOT EXISTS idx_parts_act      ON activity_participants(activity_id);
`);

/* ═════════════════════ 3) أدوات مساعدة ═════════════════════ */
const uid = (p) => p + crypto.randomBytes(5).toString('hex');
const now = () => Date.now();
const isoAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10); // n سالب = المستقبل

/* غلاف آمن يلتقط أخطاء المعالجات */
const h = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch((e) => {
    console.error('✖', req.method, req.path, e.message);
    if (!res.headersSent) res.status(500).json({ error: 'server_error' });
  });

function logAct(byName, txt) {
  db.prepare('INSERT INTO log (at, by, action) VALUES (?,?,?)').run(now(), byName || '—', String(txt).slice(0, 300));
  db.prepare('DELETE FROM log WHERE id NOT IN (SELECT id FROM log ORDER BY id DESC LIMIT 200)').run();
}

/* مُحوِّلات الصفوف إلى camelCase */
const mapUser    = (r) => ({ id: r.id, username: r.username, name: r.name, role: r.role, subject: r.subject || '', active: r.active !== 0 });
const mapStudent = (r, teacherName) => ({ id: r.id, name: r.name, level: r.level, teacherId: r.teacher_id || null, teacherName: teacherName ?? r.teacher_name ?? null, guardian: r.guardian || '', phone: r.phone || '', notes: r.notes || '' });
const mapTest    = (r) => ({ id: r.id, title: r.title, subject: r.subject, type: r.type, level: r.level, max: r.max_score, date: r.date, by: r.created_by || '' });
const mapReading = (r) => ({ id: r.id, studentId: r.student_id, studentName: r.student_name || null, kind: r.kind, surah: r.surah, from: r.from_ayah, to: r.to_ayah, ayat: r.ayat_count, listener: r.listener || '', date: r.date, note: r.note || '' });

/* ═════════════════════ 4) البيانات الأولية (Seed) ═════════════════════ */
function seedIfEmpty() {
  const c = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  if (c > 0) return;
  console.log('⟡ قاعدة بيانات جديدة — تهيئة البيانات الأولية…');

  const TEACHERS = [
    ['u2', 'jehad',   'أ. جهاد أحمد',    'القرآن الكريم والتجويد'],
    ['u3', 'hassan',  'أ. حسن',          'الفقه'],
    ['u4', 'mnour',   'أ. محمد نور سبو', 'العقيدة'],
    ['u5', 'mhassan', 'أ. محمد حسن',     'السيرة النبوية'],
    ['u6', 'kamal',   'أ. خيار كمال',    'القرآن — قسم الصغار'],
  ];

  const STUDENTS = [
    ['s1',  'ዩሱፍ አማን',        'senior', 'u2', 'አማን ሀሰን',      '0911223344'],
    ['s2',  'አሕመድ ኑር',        'senior', 'u3', 'ኑር ጃሚል',      '0912233455'],
    ['s3',  'ሐናን ተወፍቅ',       'senior', 'u4', 'ተወፍቅ ግርማ',    '0913344566'],
    ['s4',  'ቢላል ሁሴን',        'senior', 'u5', 'ሁሴን አሊ',      '0914455677'],
    ['s5',  'ፋጢማ አቡበከር',      'senior', 'u6', 'አቡበከር ኦመር',   '0915566788'],
    ['s6',  'ኦስማን መሀመድ',      'senior', 'u2', 'መሀመድ እውነት',   '0916677899'],
    ['s7',  'ሰላማዊት ከበደ',      'junior', 'u6', 'ከበደ ወልደ',     '0917788900'],
    ['s8',  'ዑመር አሊ',         'junior', 'u5', 'አሊ ሙሳ',       '0918899011'],
    ['s9',  'ደስታ ወልደ',        'junior', 'u3', 'ወልደ ኪሮስ',     '0919900122'],
    ['s10', 'ሚና ሀሰን',         'junior', 'u4', 'ሀሰን ጃብር',     '0921011233'],
    ['s11', 'ኢብራሂም ጃማል',      'junior', 'u2', 'ጃማል ዑመር',     '0922122344'],
    ['s12', 'ሩት አሕመድ',        'junior', 'u6', 'አሕመድ ነጋ',     '0923233455'],
  ];

  const TESTS = [
    ['t1', 'الاختبار القرآني الشامل — حفظ وتلاوة', 'quran',   'quran',   'senior', 100, 3, 'كيار'],
    ['t2', 'اختبار الفقه — الطهارة والصلاة',       'fiqh',    'subject', 'senior', 25,  5, 'أ. حسن'],
    ['t3', 'اختبار العقيدة — أركان الإيمان',       'aqidah',  'subject', 'senior', 25,  6, 'أ. محمد نور سبو'],
    ['t4', 'اختبار السيرة النبوية',                'sirah',   'subject', 'senior', 25,  7, 'أ. محمد حسن'],
    ['t5', 'اختبار التجويد — أحكام التلاوة',       'tajweed', 'subject', 'senior', 10,  4, 'أ. جهاد أحمد'],
    ['t6', 'اختبار الأخلاق والآداب',               'akhlaq',  'subject', 'senior', 10,  2, 'أ. جهاد أحمد'],
    ['t7', 'اختبار الحديث — الأربعون النووية',     'hadith',  'subject', 'senior', 25,  1, 'أ. محمد حسن'],
    ['t8', 'الاختبار القرآني الأساسي — جزء عمّ',   'quran',   'quran',   'junior', 20,  3, 'أ. خيار كمال'],
  ];

  /* برنامج المهرجانية — مطابق للمواصفات */
  let ord = 0;
  const A = (section, title, desc, who, mins) => ({ section, title, desc, who, mins, order: ++ord });
  const ACTIVITIES = [
    A('senior', 'قصص الصحابة',            'قصة صحابي يختارها الطالب بنفسه',                        ['ዩሱፍ አማን'], 5),
    A('senior', 'الشعر — الإلقاء',         'قصيدة في حب القرآن',                                     ['ሐናን ተወፍቅ'], 4),
    A('senior', 'الخطبة',                 'خطبة قصيرة أمام الحضور',                                 ['አሕመድ ኑር'], 6),
    A('senior', 'فضائل القرآن',           'كلمة في فضل قراءة القرآن',                               ['ፋጢማ አቡበከር'], 5),
    A('senior', 'الفقه — سؤال وجواب',     'مسائل فقهية بتحضير ذاتي (طالبان)',                       ['ቢላል ሁሴን', 'ኦስማን መሀመድ'], 8),
    A('senior', 'العقيدة — تحضير ذاتي',   'عرض مسألة عقائدية بتحضير ذاتي',                          ['ዩሱፍ አማን'], 6),
    A('senior', 'السيرة النبوية',          'موقف مختار من سيرة المصطفى ﷺ',                          ['ቢላል ሁሴን'], 5),
    A('senior', 'التجويد',                'تلاوة مجوَّدة مع بيان الأحكام',                           ['ኦስማን መሀመድ'], 6),
    A('junior', 'العقيدة — سؤال وجواب',   'أسئلة عقائدية مبسطة',                                    ['ሰላማዊት ከበደ', 'ዑመር አሊ'], 5),
    A('junior', 'الفقه — كيفية الصلاة',   'سؤال وجواب + عرض عملي لكيفية الصلاة',                    ['ደስታ ወልደ', 'ሚና ሀሰን'], 7),
    A('junior', 'السيرة',                 'قصة قصيرة من السيرة',                                    ['ኢብራሂም ጃማል'], 4),
    A('junior', 'التجويد',                'تلاوة قصيرة مراعية للأحكام',                             ['ሩት አሕመድ'], 4),
    A('junior', 'الأخلاق',                'كلمة قصيرة عن خُلق حسن',                                 ['ዑመር አሊ'], 3),
    A('junior', 'القرآن الكريم — الحفظ',  'عرض تحفيظ قصار السور أمام الناس',                        ['ሰላማዊት ከበደ', 'ደስታ ወልደ', 'ሚና ሀሰን', 'ኢብራሂም ጃማል', 'ሩት አሕመድ', 'ዑመር አሊ'], 10),
    A('junior', 'القرآن الكريم — القاعدة النورانية',
      'الحروف الهجائية + الدرس الرابع والخامس: أبدا، أحد، أخذ، أذن، أمر — ليسمعوها للناس',
      ['ሩት አሕመድ', 'ኢብራሂም ጃማል'], 8),
  ];

  const READINGS = [
    ['s1',  'z', 'البقرة',    1, 20, 'أ. جهاد أحمد',  2, 'قراءة متقنة'],
    ['s1',  'm', 'الكهف',     1, 10, 'أ. جهاد أحمد',  1, ''],
    ['s2',  'z', 'آل عمران', 15, 35, 'أ. جهاد أحمد',  2, ''],
    ['s3',  'h', 'يس',        1, 25, 'أ. محمد حسن',   3, 'حفظ جديد'],
    ['s4',  'm', 'الملك',     1, 20, 'أ. محمد حسن',   4, ''],
    ['s5',  'z', 'ق',         1, 20, 'أ. خيار كمال',  1, ''],
    ['s7',  'z', 'النبأ',     1, 15, 'أ. خيار كمال',  2, ''],
    ['s11', 'h', 'الفجر',     1, 10, 'أ. جهاد أحمد',  1, ''],
    ['s12', 'z', 'الشرح',     1,  8, 'أ. خيار كمال',  3, ''],
    ['s6',  'm', 'الرحمن',    1, 15, 'أ. جهاد أحمد',  2, ''],
  ];

  const tx = db.transaction(() => {
    const hash = (p) => bcrypt.hashSync(p, 10);
    const ts = now();

    const insU = db.prepare('INSERT INTO users (id,username,password_hash,name,role,subject,active,created_at) VALUES (?,?,?,?,?,1,?)');
    insU.run('u1', 'kiar', hash('095793'), 'كيار', 'owner', 'الإشراف العام', ts);
    TEACHERS.forEach(([id, un, nm, sub]) => insU.run(id, un, hash('123456'), nm, 'teacher', sub, ts));

    const insS = db.prepare('INSERT INTO students (id,name,level,teacher_id,guardian,phone,notes,created_at) VALUES (?,?,?,?,?,?,\'\',?)');
    STUDENTS.forEach(([id, nm, lv, tId, gd, ph]) => insS.run(id, nm, lv, tId, gd, ph, ts));

    const insT = db.prepare('INSERT INTO tests (id,title,subject,type,level,max_score,date,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)');
    TESTS.forEach(([id, ti, su, ty, lv, mx, dAgo, by]) => insT.run(id, ti, su, ty, lv, mx, isoAgo(dAgo), by, ts));

    const insA  = db.prepare('INSERT INTO activities (id,section,title,description,minutes,sort_order,created_at) VALUES (?,?,?,?,?,?,?)');
    const insAP = db.prepare('INSERT INTO activity_participants (id,activity_id,name,student_id) VALUES (?,?,?,NULL)');
    ACTIVITIES.forEach((a, i) => {
      const aId = 'a' + (i + 1);
      insA.run(aId, a.section, a.title, a.desc, a.mins, a.order, ts);
      a.who.forEach((nm, j) => insAP.run(aId + 'p' + j, aId, nm));
    });

    const insR = db.prepare('INSERT INTO readings (id,student_id,kind,surah,from_ayah,to_ayah,ayat_count,listener,date,note,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    READINGS.forEach(([sId, kd, su, f, tw, by, dAgo, nt]) => insR.run(uid('r'), sId, kd, su, f, tw, tw - f + 1, by, isoAgo(dAgo), nt, ts));

    const insSet = db.prepare('INSERT INTO settings (key,value) VALUES (?,?)');
    insSet.run('schoolName', '');
    insSet.run('festivalDate', isoAgo(-21)); // بعد 21 يوماً

    db.prepare('INSERT INTO log (at,by,action) VALUES (?,?,?)').run(ts, 'كيار', 'تهيئة النظام وإدخال البيانات الأساسية');
  });
  tx();
  console.log('✔ تمت التهيئة: المشرف kiar/095793 — الأساتذة jehad,hassan,mnour,mhassan,kamal كلمة المرور 123456');
}
seedIfEmpty();

/* ═════════════════════ 5) وسيط المصادقة والصلاحيات ═════════════════════ */
function auth(req, res, next) {
  const hd = req.headers.authorization || '';
  const token = hd.startsWith('Bearer ') ? hd.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const u = db.prepare('SELECT id,username,name,role,subject,active FROM users WHERE id=?').get(payload.id);
    if (!u || u.active === 0) return res.status(401).json({ error: 'unauthorized' });
    req.user = u;
    next();
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }
}
const ownerOnly = (req, res, next) =>
  req.user.role === 'owner' ? next() : res.status(403).json({ error: 'forbidden' });

/* ═════════════════════ 6) المصادقة (Auth) ═════════════════════ */
app.post('/api/auth/login', h(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'missing_fields' });
  const u = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(String(username).trim());
  const ok = u && u.active !== 0 && (await bcrypt.compare(String(password), u.password_hash));
  if (!ok) {
    await new Promise((r) => setTimeout(r, 600)); // إبطاء محاولات التخمين
    return res.status(401).json({ error: 'wrong_credentials' });
  }
  const token = jwt.sign({ id: u.id, role: u.role }, JWT_SECRET, { expiresIn: JWT_DAYS + 'd' });
  logAct(u.name, 'تسجيل دخول');
  res.json({ token, user: { id: u.id, username: u.username, name: u.name, role: u.role, subject: u.subject } });
}));

app.get('/api/auth/me', auth, (req, res) => res.json({ user: mapUser(req.user) }));

/* ═════════════════════ 7) إدارة الأساتذة (المشرف فقط) ═════════════════════ */
app.get('/api/users', auth, ownerOnly, (req, res) => {
  const rows = db.prepare(`
    SELECT u.*, (SELECT COUNT(*) FROM students s WHERE s.teacher_id = u.id) students_count
    FROM users u ORDER BY CASE u.role WHEN 'owner' THEN 0 ELSE 1 END, u.name
  `).all();
  res.json(rows.map((r) => ({ ...mapUser(r), studentsCount: r.students_count })));
});

app.post('/api/users', auth, ownerOnly, h((req, res) => {
  const { name, username, password, subject } = req.body || {};
  if (!name || !username || !password || String(password).length < 4)
    return res.status(400).json({ error: 'invalid_data' });
  if (db.prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE').get(String(username).trim()))
    return res.status(409).json({ error: 'username_taken' });
  const id = uid('u');
  db.prepare('INSERT INTO users (id,username,password_hash,name,role,subject,active,created_at) VALUES (?,?,?,?,?,1,?)')
    .run(id, String(username).trim(), bcrypt.hashSync(String(password), 10), String(name).trim(), 'teacher', String(subject || '').trim(), now());
  logAct(req.user.name, 'إضافة أستاذ: ' + name);
  res.status(201).json(mapUser(db.prepare('SELECT * FROM users WHERE id=?').get(id)));
}));

app.put('/api/users/:id', auth, ownerOnly, h((req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'not_found' });
  const { name, username, subject, password } = req.body || {};
  const newUn = String(username || u.username).trim();
  if (db.prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE AND id != ?').get(newUn, u.id))
    return res.status(409).json({ error: 'username_taken' });
  if (password !== undefined && password !== '' && String(password).length < 4)
    return res.status(400).json({ error: 'invalid_data' });
  db.prepare('UPDATE users SET name=?, username=?, subject=?, password_hash=? WHERE id=?')
    .run(String(name || u.name).trim(), newUn, String(subject ?? u.subject).trim(),
         password ? bcrypt.hashSync(String(password), 10) : u.password_hash, u.id);
  logAct(req.user.name, 'تعديل أستاذ: ' + (name || u.name));
  res.json(mapUser(db.prepare('SELECT * FROM users WHERE id=?').get(u.id)));
}));

app.patch('/api/users/:id/status', auth, ownerOnly, h((req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'not_found' });
  if (u.id === req.user.id) return res.status(400).json({ error: 'cannot_suspend_self' });
  const active = req.body && req.body.active === false ? 0 : 1;
  db.prepare('UPDATE users SET active=? WHERE id=?').run(active, u.id);
  logAct(req.user.name, (active ? 'تنشيط' : 'إيقاف') + ' حساب: ' + u.name);
  res.json(mapUser(db.prepare('SELECT * FROM users WHERE id=?').get(u.id)));
}));

app.delete('/api/users/:id', auth, ownerOnly, h((req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'not_found' });
  if (u.id === req.user.id) return res.status(400).json({ error: 'cannot_delete_self' });
  if (u.role === 'owner') return res.status(400).json({ error: 'cannot_delete_owner' });
  db.prepare('DELETE FROM users WHERE id=?').run(u.id); // طلابه يبقون بدون أستاذ (ON DELETE SET NULL)
  logAct(req.user.name, 'حذف أستاذ: ' + u.name);
  res.json({ ok: true });
}));

/* ═════════════════════ 8) الطلاب ═════════════════════ */
app.get('/api/students', auth, h((req, res) => {
  let sql = `SELECT s.*, u.name teacher_name FROM students s LEFT JOIN users u ON u.id = s.teacher_id WHERE 1=1`;
  const p = [];
  const { level, teacherId, q } = req.query;
  if (level === 'senior' || level === 'junior') { sql += ' AND s.level=?'; p.push(level); }
  if (teacherId) { sql += ' AND s.teacher_id=?'; p.push(String(teacherId)); }
  if (q) { const lk = '%' + String(q) + '%'; sql += ' AND (s.name LIKE ? OR s.guardian LIKE ? OR s.phone LIKE ?)'; p.push(lk, lk, lk); }
  sql += ' ORDER BY s.name COLLATE NOCASE';
  res.json(db.prepare(sql).all(...p).map((r) => mapStudent(r)));
}));

app.get('/api/students/:id', auth, h((req, res) => {
  const r = db.prepare('SELECT s.*, u.name teacher_name FROM students s LEFT JOIN users u ON u.id=s.teacher_id WHERE s.id=?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'not_found' });
  res.json(mapStudent(r));
}));

app.post('/api/students', auth, h((req, res) => {
  const { name, level, teacherId, guardian, phone, notes } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name_required' });
  const lv = level === 'junior' ? 'junior' : 'senior';
  if (teacherId && !db.prepare('SELECT 1 FROM users WHERE id=?').get(teacherId))
    return res.status(400).json({ error: 'bad_teacher' });
  const id = uid('s');
  db.prepare('INSERT INTO students (id,name,level,teacher_id,guardian,phone,notes,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, String(name).trim(), lv, teacherId || null, String(guardian || '').trim(), String(phone || '').trim(), String(notes || '').trim(), now());
  logAct(req.user.name, 'تسجيل طالب: ' + name);
  res.status(201).json(mapStudent(db.prepare('SELECT s.*, u.name teacher_name FROM students s LEFT JOIN users u ON u.id=s.teacher_id WHERE s.id=?').get(id)));
}));

app.put('/api/students/:id', auth, h((req, res) => {
  const st = db.prepare('SELECT * FROM students WHERE id=?').get(req.params.id);
  if (!st) return res.status(404).json({ error: 'not_found' });
  const { name, level, teacherId, guardian, phone, notes } = req.body || {};
  if (name !== undefined && !String(name).trim()) return res.status(400).json({ error: 'name_required' });
  if (teacherId && !db.prepare('SELECT 1 FROM users WHERE id=?').get(teacherId))
    return res.status(400).json({ error: 'bad_teacher' });
  db.prepare('UPDATE students SET name=?, level=?, teacher_id=?, guardian=?, phone=?, notes=? WHERE id=?')
    .run(String(name ?? st.name).trim(),
         (level === 'junior' || level === 'senior') ? level : st.level,
         teacherId === undefined ? st.teacher_id : (teacherId || null),
         String(guardian ?? st.guardian).trim(),
         String(phone ?? st.phone).trim(),
         String(notes ?? st.notes).trim(),
         st.id);
  logAct(req.user.name, 'تعديل طالب: ' + (name || st.name));
  res.json(mapStudent(db.prepare('SELECT s.*, u.name teacher_name FROM students s LEFT JOIN users u ON u.id=s.teacher_id WHERE s.id=?').get(st.id)));
}));

app.delete('/api/students/:id', auth, h((req, res) => {
  const st = db.prepare('SELECT * FROM students WHERE id=?').get(req.params.id);
  if (!st) return res.status(404).json({ error: 'not_found' });
  const allowed = req.user.role === 'owner' || st.teacher_id === req.user.id;
  if (!allowed) return res.status(403).json({ error: 'forbidden' });
  db.prepare('DELETE FROM students WHERE id=?').run(st.id); // درجاته وقراءاته تُحذف تلقائياً (CASCADE)
  logAct(req.user.name, 'حذف طالب: ' + st.name);
  res.json({ ok: true });
}));

/* ═════════════════════ 9) الاختبارات ═════════════════════ */
app.get('/api/tests', auth, h((req, res) => {
  let sql = `SELECT t.*, (SELECT COUNT(DISTINCT student_id) FROM scores WHERE test_id = t.id) scored FROM tests t`;
  const p = [];
  if (req.query.level === 'senior' || req.query.level === 'junior') { sql += ' WHERE t.level=?'; p.push(req.query.level); }
  sql += ' ORDER BY t.date DESC, t.created_at DESC';
  res.json(db.prepare(sql).all(...p).map((r) => ({ ...mapTest(r), scored: r.scored })));
}));

app.get('/api/tests/:id', auth, h((req, res) => {
  const r = db.prepare('SELECT * FROM tests WHERE id=?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'not_found' });
  res.json(mapTest(r));
}));

const VALID_SUBJECTS = ['quran', 'fiqh', 'aqidah', 'sirah', 'tajweed', 'akhlaq', 'hadith', 'other'];

app.post('/api/tests', auth, h((req, res) => {
  const { title, subject, type, level, max, date } = req.body || {};
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'title_required' });
  const su = VALID_SUBJECTS.includes(subject) ? subject : 'other';
  const ty = type === 'quran' ? 'quran' : 'subject';
  const lv = level === 'junior' ? 'junior' : 'senior';
  const mx = Math.max(1, Number(max) > 0 ? Number(max) : 25);
  const dt = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? date : isoAgo(0);
  const id = uid('t');
  db.prepare('INSERT INTO tests (id,title,subject,type,level,max_score,date,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, String(title).trim(), su, ty, lv, mx, dt, req.user.name, now());
  logAct(req.user.name, 'إنشاء اختبار: ' + title);
  res.status(201).json(mapTest(db.prepare('SELECT * FROM tests WHERE id=?').get(id)));
}));

app.put('/api/tests/:id', auth, h((req, res) => {
  const ts = db.prepare('SELECT * FROM tests WHERE id=?').get(req.params.id);
  if (!ts) return res.status(404).json({ error: 'not_found' });
  const { title, subject, type, level, max, date } = req.body || {};
  const mx = max !== undefined ? Math.max(1, Number(max) > 0 ? Number(max) : 1) : ts.max_score;
  db.prepare('UPDATE tests SET title=?, subject=?, type=?, level=?, max_score=?, date=? WHERE id=?')
    .run(String(title ?? ts.title).trim(),
         VALID_SUBJECTS.includes(subject) ? subject : ts.subject,
         type === 'quran' || type === 'subject' ? type : ts.type,
         level === 'junior' || level === 'senior' ? level : ts.level,
         mx,
         /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? date : ts.date,
         ts.id);
  logAct(req.user.name, 'تعديل اختبار: ' + (title || ts.title));
  res.json(mapTest(db.prepare('SELECT * FROM tests WHERE id=?').get(ts.id)));
}));

app.delete('/api/tests/:id', auth, h((req, res) => {
  const ts = db.prepare('SELECT * FROM tests WHERE id=?').get(req.params.id);
  if (!ts) return res.status(404).json({ error: 'not_found' });
  db.prepare('DELETE FROM tests WHERE id=?').run(ts.id); // درجاته تُحذف تلقائياً (CASCADE)
  logAct(req.user.name, 'حذف اختبار: ' + ts.title);
  res.json({ ok: true });
}));

/* ═════════════════════ 10) الدرجات ═════════════════════ */
/* كل طلاب القسم مع درجاتهم (الموجود وغير الموجود) لاختبار معين */
app.get('/api/tests/:id/scores', auth, h((req, res) => {
  const test = db.prepare('SELECT * FROM tests WHERE id=?').get(req.params.id);
  if (!test) return res.status(404).json({ error: 'not_found' });
  const rows = db.prepare(`
    SELECT s.id, s.name, s.level, s.teacher_id, sc.score, sc.note, sc.updated_at
    FROM students s
    LEFT JOIN scores sc ON sc.student_id = s.id AND sc.test_id = ?
    WHERE s.level = ?
    ORDER BY s.name COLLATE NOCASE
  `).all(test.id, test.level);
  res.json({
    test: mapTest(test),
    rows: rows.map((r) => ({
      studentId: r.id, name: r.name, level: r.level, teacherId: r.teacher_id,
      score: r.score === null ? null : r.score, note: r.note || '', updatedAt: r.updated_at || null,
    })),
  });
}));

/* حفظ جماعي للدرجات: score فارغ/null = حذف */
app.put('/api/tests/:id/scores', auth, h((req, res) => {
  const test = db.prepare('SELECT * FROM tests WHERE id=?').get(req.params.id);
  if (!test) return res.status(404).json({ error: 'not_found' });
  const list = req.body && Array.isArray(req.body.scores) ? req.body.scores : null;
  if (!list) return res.status(400).json({ error: 'scores_array_required' });
  const valid = new Set(db.prepare('SELECT id FROM students WHERE level=?').all(test.level).map((r) => r.id));

  const up = db.prepare(`
    INSERT INTO scores (id,test_id,student_id,score,note,entered_by,updated_at) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(test_id, student_id) DO UPDATE SET
      score=excluded.score, note=excluded.note, entered_by=excluded.entered_by, updated_at=excluded.updated_at
  `);
  const del = db.prepare('DELETE FROM scores WHERE test_id=? AND student_id=?');

  const tx = db.transaction(() => {
    let n = 0;
    for (const it of list) {
      if (!it || !valid.has(it.studentId)) continue;
      if (it.score === null || it.score === undefined || it.score === '') { del.run(test.id, it.studentId); continue; }
      const v = Number(it.score);
      if (!isFinite(v)) continue;
      up.run(uid('c'), test.id, it.studentId, Math.max(0, Math.min(test.max_score, v)),
             String(it.note || '').slice(0, 500), req.user.name, now());
      n++;
    }
    logAct(req.user.name, 'تسجيل درجات: ' + test.title + ' (' + n + ')');
    return n;
  });
  res.json({ ok: true, saved: tx() });
}));

/* تقرير طالب: درجاته + متوسطه + ترتيبه في قسمه */
app.get('/api/students/:id/report', auth, h((req, res) => {
  const st = db.prepare('SELECT * FROM students WHERE id=?').get(req.params.id);
  if (!st) return res.status(404).json({ error: 'not_found' });
  const rows = db.prepare(`
    SELECT sc.score, sc.note, t.id tid, t.title, t.subject, t.max_score, t.date
    FROM scores sc JOIN tests t ON t.id = sc.test_id
    WHERE sc.student_id=? ORDER BY t.date DESC
  `).all(st.id).map((r) => ({ testId: r.tid, title: r.title, subject: r.subject, max: r.max_score, score: r.score, note: r.note || '', date: r.date }));
  const avg = rows.length ? rows.reduce((a, r) => a + r.score / r.max, 0) / rows.length * 100 : 0;
  const peers = db.prepare(`
    SELECT s.id, AVG(sc.score*1.0/t.max_score) a
    FROM students s
    LEFT JOIN scores sc ON sc.student_id = s.id
    LEFT JOIN tests t   ON t.id = sc.test_id
    WHERE s.level=? GROUP BY s.id
  `).all(st.level).sort((x, y) => (y.a ?? -1) - (x.a ?? -1));
  const rank = peers.findIndex((p) => p.id === st.id) + 1;
  const teacher = st.teacher_id ? db.prepare('SELECT name FROM users WHERE id=?').get(st.teacher_id) : null;
  res.json({
    student: mapStudent(st, teacher ? teacher.name : null),
    rows, avg: Math.round(avg * 10) / 10,
    rank: rank || null, peers: peers.length,
  });
}));

/* ═════════════════════ 11) المهرجانية (الأنشطة) ═════════════════════ */
function activitiesAll() {
  const acts = db.prepare('SELECT * FROM activities ORDER BY CASE section WHEN \'senior\' THEN 0 ELSE 1 END, sort_order, id').all();
  const parts = db.prepare('SELECT * FROM activity_participants ORDER BY id').all();
  const map = new Map(acts.map((a) => [a.id, []]));
  parts.forEach((p) => { if (map.has(p.activity_id)) map.get(p.activity_id).push({ id: p.id, name: p.name, studentId: p.student_id }); });
  return acts.map((a) => ({
    id: a.id, section: a.section, title: a.title, description: a.description || '',
    minutes: a.minutes, order: a.sort_order, participants: map.get(a.id),
  }));
}

app.get('/api/activities', auth, (req, res) => res.json(activitiesAll()));

const normParts = (arr) => (Array.isArray(arr) ? arr : [])
  .map((p) => (typeof p === 'string' ? p.trim() : p && typeof p.name === 'string' ? p.name.trim() : ''))
  .filter(Boolean).slice(0, 100);

app.post('/api/activities', auth, h((req, res) => {
  const { section, title, description, minutes, participants } = req.body || {};
  const sec = section === 'junior' ? 'junior' : 'senior';
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'title_required' });
  const id = uid('a');
  const order = (db.prepare('SELECT COALESCE(MAX(sort_order),0) m FROM activities WHERE section=?').get(sec).m) + 1;
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO activities (id,section,title,description,minutes,sort_order,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(id, sec, String(title).trim(), String(description || '').trim(), Math.max(0, parseInt(minutes) || 5), order, now());
    normParts(participants).forEach((nm, i) =>
      db.prepare('INSERT INTO activity_participants (id,activity_id,name,student_id) VALUES (?,?,?,NULL)').run(id + 'p' + i, id, nm));
    logAct(req.user.name, 'إضافة نشاط مهرجانية: ' + title);
  });
  tx();
  res.status(201).json(activitiesAll().find((a) => a.id === id));
}));

app.put('/api/activities/:id', auth, h((req, res) => {
  const a = db.prepare('SELECT * FROM activities WHERE id=?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'not_found' });
  const { section, title, description, minutes, participants } = req.body || {};
  const tx = db.transaction(() => {
    db.prepare('UPDATE activities SET section=?, title=?, description=?, minutes=? WHERE id=?')
      .run(section === 'junior' || section === 'senior' ? section : a.section,
           String(title ?? a.title).trim(), String(description ?? a.description).trim(),
           minutes !== undefined ? Math.max(0, parseInt(minutes) || 0) : a.minutes, a.id);
    if (participants !== undefined) {
      db.prepare('DELETE FROM activity_participants WHERE activity_id=?').run(a.id);
      normParts(participants).forEach((nm, i) =>
        db.prepare('INSERT INTO activity_participants (id,activity_id,name,student_id) VALUES (?,?,?,NULL)').run(a.id + 'n' + i, a.id, nm));
    }
    logAct(req.user.name, 'تعديل نشاط مهرجانية: ' + (title || a.title));
  });
  tx();
  res.json(activitiesAll().find((x) => x.id === a.id));
}));

app.delete('/api/activities/:id', auth, h((req, res) => {
  const a = db.prepare('SELECT * FROM activities WHERE id=?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'not_found' });
  db.prepare('DELETE FROM activities WHERE id=?').run(a.id); // المشاركون يُحذفون تلقائياً
  logAct(req.user.name, 'حذف نشاط مهرجانية: ' + a.title);
  res.json({ ok: true });
}));

/* ═════════════════════ 12) الزيادة في القراءة (مستقلة تماماً) ═════════════════════ */
app.get('/api/readings', auth, h((req, res) => {
  let sql = `SELECT r.*, s.name student_name FROM readings r LEFT JOIN students s ON s.id = r.student_id WHERE 1=1`;
  const p = [];
  if (req.query.studentId) { sql += ' AND r.student_id=?'; p.push(String(req.query.studentId)); }
  if (['z', 'm', 'h'].includes(req.query.kind)) { sql += ' AND r.kind=?'; p.push(req.query.kind); }
  sql += ' ORDER BY r.date DESC, r.id DESC LIMIT 500';
  res.json(db.prepare(sql).all(...p).map(mapReading));
}));

app.get('/api/readings/leaderboard', auth, (req, res) => {
  res.json(db.prepare(`
    SELECT r.student_id, s.name, SUM(r.ayat_count) total
    FROM readings r JOIN students s ON s.id = r.student_id
    GROUP BY r.student_id ORDER BY total DESC LIMIT 10
  `).all().map((r) => ({ studentId: r.student_id, name: r.name, totalAyat: r.total })));
});

app.post('/api/readings', auth, h((req, res) => {
  const { studentId, kind, surah, from, to, listener, date, note } = req.body || {};
  const st = db.prepare('SELECT 1 FROM students WHERE id=?').get(studentId);
  if (!st) return res.status(400).json({ error: 'bad_student' });
  if (!['z', 'm', 'h'].includes(kind)) return res.status(400).json({ error: 'bad_kind' });
  if (!surah || !String(surah).trim()) return res.status(400).json({ error: 'bad_surah' });
  const f = parseInt(from), tw = parseInt(to);
  if (!(f >= 1 && tw >= f)) return res.status(400).json({ error: 'bad_range' });
  const id = uid('r');
  db.prepare('INSERT INTO readings (id,student_id,kind,surah,from_ayah,to_ayah,ayat_count,listener,date,note,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, studentId, kind, String(surah).trim(), f, tw, tw - f + 1,
         String(listener || '').trim(),
         /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? date : isoAgo(0),
         String(note || '').trim(), now());
  logAct(req.user.name, 'تسجيل زيادة قراءة: ' + surah + ' ' + f + '–' + tw);
  res.status(201).json(mapReading(db.prepare('SELECT r.*, s.name student_name FROM readings r LEFT JOIN students s ON s.id=r.student_id WHERE r.id=?').get(id)));
}));

app.delete('/api/readings/:id', auth, h((req, res) => {
  const r = db.prepare('SELECT * FROM readings WHERE id=?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'not_found' });
  db.prepare('DELETE FROM readings WHERE id=?').run(r.id);
  logAct(req.user.name, 'حذف سجل قراءة: ' + r.surah);
  res.json({ ok: true });
}));

/* ═════════════════════ 13) لوحة التحكم (إحصاءات) ═════════════════════ */
app.get('/api/dashboard', auth, (req, res) => {
  const students = db.prepare('SELECT COUNT(*) c FROM students').get().c;
  const tests = db.prepare('SELECT COUNT(*) c FROM tests').get().c;
  const acts = db.prepare('SELECT COUNT(*) c FROM activities').get().c;
  const ayat = db.prepare('SELECT COALESCE(SUM(ayat_count),0) s FROM readings').get().s;
  const rows = db.prepare('SELECT sc.score, t.max_score m FROM scores sc JOIN tests t ON t.id=sc.test_id').all();
  const avg = rows.length ? rows.reduce((a, r) => a + r.score / r.m, 0) / rows.length * 100 : 0;
  const pulse = db.prepare(`
    SELECT t.subject, AVG(sc.score*1.0/t.max_score) a, COUNT(*) n
    FROM scores sc JOIN tests t ON t.id = sc.test_id
    GROUP BY t.subject ORDER BY a DESC
  `).all().map((r) => ({ subject: r.subject, avg: Math.round(r.a * 100) / 100, count: r.n }));
  const log = db.prepare('SELECT at, by, action FROM log ORDER BY id DESC LIMIT 10').all()
    .map((l) => ({ at: l.at, by: l.by, action: l.action }));
  res.json({ students, tests, activities, ayat, avg: Math.round(avg), pulse, log });
});

/* ═════════════════════ 14) الإعدادات والسجل ═════════════════════ */
function getSettings() {
  const m = Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((r) => [r.key, r.value]));
  return { schoolName: m.schoolName || '', festivalDate: m.festivalDate || isoAgo(-21) };
}

app.get('/api/settings', auth, (req, res) => res.json(getSettings()));

app.put('/api/settings', auth, ownerOnly, h((req, res) => {
  const { schoolName, festivalDate } = req.body || {};
  const up = db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  if (schoolName !== undefined) up.run('schoolName', String(schoolName).trim());
  if (festivalDate && /^\d{4}-\d{2}-\d{2}$/.test(String(festivalDate))) up.run('festivalDate', String(festivalDate));
  logAct(req.user.name, 'تعديل الإعدادات');
  res.json(getSettings());
}));

app.get('/api/log', auth, (req, res) => {
  res.json(db.prepare('SELECT at, by, action FROM log ORDER BY id DESC LIMIT 60').all());
});

/* ═════════════════════ 15) النسخ الاحتياطي (المشرف فقط) ═════════════════════ */
app.get('/api/backup', auth, ownerOnly, (req, res) => {
  res.json({
    meta: { app: 'nour-summer-school', version: 1, exportedAt: now() },
    users: db.prepare('SELECT * FROM users').all(),
    students: db.prepare('SELECT * FROM students').all(),
    tests: db.prepare('SELECT * FROM tests').all(),
    scores: db.prepare('SELECT * FROM scores').all(),
    activities: db.prepare('SELECT * FROM activities').all(),
    activity_participants: db.prepare('SELECT * FROM activity_participants').all(),
    readings: db.prepare('SELECT * FROM readings').all(),
    settings: db.prepare('SELECT * FROM settings').all(),
    log: db.prepare('SELECT * FROM log ORDER BY id DESC LIMIT 200').all(),
  });
});

app.post('/api/backup', auth, ownerOnly, h((req, res) => {
  const d = req.body;
  if (!d || !Array.isArray(d.users) || !Array.isArray(d.students) || !Array.isArray(d.tests))
    return res.status(400).json({ error: 'invalid_backup' });
  if (!d.users.some((u) => u.role === 'owner' && u.active !== 0))
    return res.status(400).json({ error: 'backup_has_no_owner' });

  const tx = db.transaction(() => {
    ['scores', 'readings', 'activity_participants', 'activities', 'tests', 'students', 'log', 'users', 'settings']
      .forEach((t) => db.prepare('DELETE FROM ' + t).run());

    const insU = db.prepare('INSERT INTO users (id,username,password_hash,name,role,subject,active,created_at) VALUES (@id,@username,@password_hash,@name,@role,@subject,@active,@created_at)');
    d.users.forEach((u) => insU.run({
      id: u.id || uid('u'), username: u.username || uid('x'), password_hash: u.password_hash || bcrypt.hashSync('123456', 10),
      name: u.name || '', role: u.role === 'owner' ? 'owner' : 'teacher', subject: u.subject || '',
      active: u.active === 0 ? 0 : 1, created_at: u.created_at || now(),
    }));

    const insS = db.prepare('INSERT INTO students (id,name,level,teacher_id,guardian,phone,notes,created_at) VALUES (@id,@name,@level,@teacher_id,@guardian,@phone,@notes,@created_at)');
    (d.students || []).forEach((s) => insS.run({
      id: s.id || uid('s'), name: s.name || '—', level: s.level === 'junior' ? 'junior' : 'senior',
      teacher_id: s.teacher_id || null, guardian: s.guardian || '', phone: s.phone || '',
      notes: s.notes || '', created_at: s.created_at || now(),
    }));

    const insT = db.prepare('INSERT INTO tests (id,title,subject,type,level,max_score,date,created_by,created_at) VALUES (@id,@title,@subject,@type,@level,@max_score,@date,@created_by,@created_at)');
    (d.tests || []).forEach((t) => insT.run({
      id: t.id || uid('t'), title: t.title || '—', subject: t.subject || 'other',
      type: t.type === 'quran' ? 'quran' : 'subject', level: t.level === 'junior' ? 'junior' : 'senior',
      max_score: Number(t.max_score) > 0 ? Number(t.max_score) : 25, date: t.date || isoAgo(0),
      created_by: t.created_by || '', created_at: t.created_at || now(),
    }));

    const insC = db.prepare('INSERT INTO scores (id,test_id,student_id,score,note,entered_by,updated_at) VALUES (@id,@test_id,@student_id,@score,@note,@entered_by,@updated_at)');
    (d.scores || []).forEach((c) => insC.run({
      id: c.id || uid('c'), test_id: c.test_id, student_id: c.student_id, score: Number(c.score) || 0,
      note: c.note || '', entered_by: c.entered_by || '', updated_at: c.updated_at || now(),
    }));

    const insA = db.prepare('INSERT INTO activities (id,section,title,description,minutes,sort_order,created_at) VALUES (@id,@section,@title,@description,@minutes,@sort_order,@created_at)');
    (d.activities || []).forEach((a) => insA.run({
      id: a.id || uid('a'), section: a.section === 'junior' ? 'junior' : 'senior', title: a.title || '—',
      description: a.description || '', minutes: a.minutes || 5, sort_order: a.sort_order || 0, created_at: a.created_at || now(),
    }));

    const insP = db.prepare('INSERT INTO activity_participants (id,activity_id,name,student_id) VALUES (@id,@activity_id,@name,@student_id)');
    (d.activity_participants || []).forEach((p) => insP.run({
      id: p.id || uid('p'), activity_id: p.activity_id, name: p.name || '—', student_id: p.student_id || null,
    }));

    const insR = db.prepare('INSERT INTO readings (id,student_id,kind,surah,from_ayah,to_ayah,ayat_count,listener,date,note,created_at) VALUES (@id,@student_id,@kind,@surah,@from_ayah,@to_ayah,@ayat_count,@listener,@date,@note,@created_at)');
    (d.readings || []).forEach((r) => insR.run({
      id: r.id || uid('r'), student_id: r.student_id, kind: ['z', 'm', 'h'].includes(r.kind) ? r.kind : 'z',
      surah: r.surah || '—', from_ayah: Math.max(1, parseInt(r.from_ayah) || 1),
      to_ayah: Math.max(parseInt(r.from_ayah) || 1, parseInt(r.to_ayah) || 1),
      ayat_count: Math.max(1, parseInt(r.ayat_count) || 1), listener: r.listener || '',
      date: r.date || isoAgo(0), note: r.note || '', created_at: r.created_at || now(),
    }));

    const insSet = db.prepare('INSERT INTO settings (key,value) VALUES (?,?)');
    (d.settings || []).forEach((s) => insSet.run(s.key, s.value));
    if (!db.prepare('SELECT 1 FROM settings WHERE key=?').get('festivalDate')) insSet.run('festivalDate', isoAgo(-21));

    const insL = db.prepare('INSERT INTO log (at,by,action) VALUES (?,?,?)');
    (d.log || []).forEach((l) => insL.run(l.at || now(), l.by || '—', l.action || ''));
    insL.run(now(), req.user.name, 'استيراد نسخة احتياطية كاملة');
  });
  tx();
  res.json({ ok: true });
}));

/* ═════════════════════ 16) فحص الصحة + تقديم الواجهة ═════════════════════ */
app.get('/api/health', (req, res) => res.json({ ok: true, time: now() }));

app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

if (fs.existsSync(PUB_DIR)) {
  app.use(express.static(PUB_DIR));
  app.use((req, res, next) => {
    if (req.method === 'GET') return res.sendFile(path.join(PUB_DIR, 'index.html'));
    next();
  });
}

app.use((err, req, res, next) => {
  console.error('✖', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'server_error' });
});

/* ═════════════════════ 17) الإقلاع ═════════════════════ */
app.listen(PORT, () => {
  console.log('');
  console.log('  ══════════════════════════════════════════════');
  console.log('   مدرسة النور الصيفية — الخادم يعمل الآن');
  console.log('   العنوان:  http://localhost:' + PORT);
  console.log('   المشرف:   kiar / 095793');
  console.log('   الأساتذة: jehad · hassan · mnour · mhassan · kamal / 123456');
  console.log('   قاعدة البيانات: ' + DB_FILE);
  console.log('  ══════════════════════════════════════════════');
  console.log('');
});

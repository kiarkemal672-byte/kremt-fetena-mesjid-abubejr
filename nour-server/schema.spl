/* ═══════════════════════════════════════════════════════════════════════════
   مدرسة النور الصيفية القرآنية — مخطط قاعدة البيانات الكامل
   Al-Nour Summer Quranic School — Complete Database Schema
   ─────────────────────────────────────────────────────────────────────────────
   المحرك:    MySQL 8.0+  أو  MariaDB 10.4+
   الترميز:   utf8mb4 — يدعم الأمهرية والعربية والإنجليزية في وقت واحد
   الجداول:   users · students · tests · student_scores
              festival_activities · festival_participants
              readings · settings · system_log
   العروض:    v_subject_pulse · v_student_summary
              v_reading_leaderboard · v_test_overview
   ملاحظة:    لإعادة التثبيت من الصفر فعّل السطر التالي:
              DROP DATABASE IF EXISTS nour_school;
   ═══════════════════════════════════════════════════════════════════════════ */

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 1;

CREATE DATABASE IF NOT EXISTS nour_school
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE nour_school;

/* ═════════════════════════════════════════════════════════════════════════
   1) الجدول: users — الحسابات (المشرف العام + الأساتذة)
      لا توجد حسابات للطلاب إطلاقاً بحسب متطلبات النظام
   ═════════════════════════════════════════════════════════════════════════ */
CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR(14)  NOT NULL                COMMENT 'معرّف فريد',
  username      VARCHAR(50)  NOT NULL                COMMENT 'اسم المستخدم للدخول (فريد، غير حساس لحالة الأحرف)',
  password_hash VARCHAR(100) NOT NULL                COMMENT 'تجزئة كلمة المرور bcrypt — لا تُخزن كلمة المرور صريحة أبداً',
  name          VARCHAR(100) NOT NULL                COMMENT 'الاسم الكامل الظاهر',
  role          ENUM('owner','teacher') NOT NULL DEFAULT 'teacher'
                                                      COMMENT 'owner = المشرف العام (صلاحية مطلقة) / teacher = أستاذ',
  subject       VARCHAR(120) NOT NULL DEFAULT ''     COMMENT 'التخصص أو المادة',
  active        TINYINT(1)   NOT NULL DEFAULT 1      COMMENT '1 = نشط ، 0 = موقوف (لا يستطيع الدخول)',
  created_at    BIGINT       NOT NULL                COMMENT 'وقت الإنشاء (بالمللي ثانية)',
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  KEY idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='حسابات النظام: المشرف العام والأساتذة فقط';

/* ═════════════════════════════════════════════════════════════════════════
   2) الجدول: students — الطلاب
      level: senior = الكبار / junior = الصغار
      حذف الأستاذ لا يحذف طلابه (يبقون بدون أستاذ مسؤول)
   ═════════════════════════════════════════════════════════════════════════ */
CREATE TABLE IF NOT EXISTS students (
  id         VARCHAR(14)  NOT NULL                   COMMENT 'معرّف فريد',
  name       VARCHAR(120) NOT NULL                   COMMENT 'اسم الطالب الكامل',
  level      ENUM('senior','junior') NOT NULL        COMMENT 'senior = الكبار / junior = الصغار',
  teacher_id VARCHAR(14)  NULL DEFAULT NULL          COMMENT 'الأستاذ المسؤول (اختياري)',
  guardian   VARCHAR(120) NOT NULL DEFAULT ''        COMMENT 'ولي الأمر',
  phone      VARCHAR(30)  NOT NULL DEFAULT ''        COMMENT 'رقم الهاتف',
  notes      VARCHAR(500) NOT NULL DEFAULT ''        COMMENT 'ملاحظات',
  created_at BIGINT       NOT NULL                   COMMENT 'وقت التسجيل (بالمللي ثانية)',
  PRIMARY KEY (id),
  KEY idx_students_level (level),
  KEY idx_students_teacher (teacher_id),
  KEY idx_students_name (name),
  CONSTRAINT fk_students_teacher
    FOREIGN KEY (teacher_id) REFERENCES users (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='سجل الطلاب المرتبطين بالأساتذة';

/* ═════════════════════════════════════════════════════════════════════════
   3) الجدول: tests — الاختبارات والتقييمات
      type:    quran = اختبار قرآني / subject = اختبار مادة
      subject: quran · fiqh · aqidah · sirah · tajweed · akhlaq · hadith · other
      max_score: الدرجة العظمى (الأساس) — مثل 10 أو 25 أو 50 أو 100
   ═════════════════════════════════════════════════════════════════════════ */
CREATE TABLE IF NOT EXISTS tests (
  id         VARCHAR(14)  NOT NULL                   COMMENT 'معرّف فريد',
  title      VARCHAR(200) NOT NULL                   COMMENT 'عنوان الاختبار',
  subject    VARCHAR(30)  NOT NULL DEFAULT 'other'   COMMENT 'المادة (يُتحقق منها في طبقة التطبيق)',
  type       ENUM('quran','subject') NOT NULL        COMMENT 'نوع الاختبار: قرآني أو مادة',
  level      ENUM('senior','junior') NOT NULL        COMMENT 'القسم المستهدف: الكبار أو الصغار',
  max_score  DECIMAL(6,2) NOT NULL DEFAULT 25.00     COMMENT 'الدرجة العظمى (الأساس الذي تُحسب منه النسبة)',
  date       DATE         NOT NULL                   COMMENT 'تاريخ الاختبار',
  created_by VARCHAR(100) NOT NULL DEFAULT ''        COMMENT 'منشئ الاختبار (المشرف أو الأستاذ)',
  created_at BIGINT       NOT NULL                   COMMENT 'وقت الإنشاء (بالمللي ثانية)',
  PRIMARY KEY (id),
  KEY idx_tests_level_date (level, date),
  KEY idx_tests_subject (subject),
  CONSTRAINT chk_tests_max CHECK (max_score > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='الاختبارات القرآنية والمتنوعة مع الدرجة العظمى';

/* ═════════════════════════════════════════════════════════════════════════
   4) الجدول: student_scores — الدرجات
      قيد فريد: درجة واحدة لكل (طالب × اختبار) — التحديث يستبدل القديمة
      حذف الطالب أو الاختبار يحذف درجاته تلقائياً (CASCADE)
   ═════════════════════════════════════════════════════════════════════════ */
CREATE TABLE IF NOT EXISTS student_scores (
  id          VARCHAR(14)  NOT NULL                  COMMENT 'معرّف فريد',
  test_id     VARCHAR(14)  NOT NULL                  COMMENT 'الاختبار',
  student_id  VARCHAR(14)  NOT NULL                  COMMENT 'الطالب',
  score       DECIMAL(6,2) NOT NULL                  COMMENT 'الدرجة المحصّلة (تُتحقق ≤ العظمى في التطبيق)',
  note        VARCHAR(500) NOT NULL DEFAULT ''       COMMENT 'ملاحظة المصحح',
  entered_by  VARCHAR(100) NOT NULL DEFAULT ''       COMMENT 'من أدخل الدرجة',
  updated_at  BIGINT       NOT NULL                  COMMENT 'آخر تحديث (بالمللي ثانية)',
  PRIMARY KEY (id),
  UNIQUE KEY uq_scores_test_student (test_id, student_id),
  KEY idx_scores_student (student_id),
  CONSTRAINT fk_scores_test
    FOREIGN KEY (test_id) REFERENCES tests (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_scores_student
    FOREIGN KEY (student_id) REFERENCES students (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_scores_value CHECK (score >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='درجات الطلاب في الاختبارات';

/* ═════════════════════════════════════════════════════════════════════════
   5) الجدول: festival_activities — أنشطة يوم اختتام الصيف (المهرجانية)
      section: senior = قسم الكبار / junior = قسم الصغار
   ═════════════════════════════════════════════════════════════════════════ */
CREATE TABLE IF NOT EXISTS festival_activities (
  id          VARCHAR(14)  NOT NULL                  COMMENT 'معرّف فريد',
  section     ENUM('senior','junior') NOT NULL       COMMENT 'قسم العرض: الكبار أو الصغار',
  title       VARCHAR(200) NOT NULL                  COMMENT 'اسم النشاط (خطبة، شعر، عقيدة…)',
  description VARCHAR(500) NOT NULL DEFAULT ''       COMMENT 'وصف النشاط',
  minutes     SMALLINT     NOT NULL DEFAULT 5        COMMENT 'المدة بالدقائق',
  sort_order  INT          NOT NULL DEFAULT 0        COMMENT 'ترتيب الظهور في البرنامج',
  created_at  BIGINT       NOT NULL                  COMMENT 'وقت الإنشاء (بالمللي ثانية)',
  PRIMARY KEY (id),
  KEY idx_activities_section_order (section, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='برنامج يوم الاختتام — الأنشطة';

/* ═════════════════════════════════════════════════════════════════════════
   6) الجدول: festival_participants — المشاركون في أنشطة المهرجانية
      الاسم نص حر + ربط اختياري بالطالب إن وجد في السجل
   ═════════════════════════════════════════════════════════════════════════ */
CREATE TABLE IF NOT EXISTS festival_participants (
  id          VARCHAR(14)  NOT NULL                  COMMENT 'معرّف فريد',
  activity_id VARCHAR(14)  NOT NULL                  COMMENT 'النشاط',
  name        VARCHAR(120) NOT NULL                  COMMENT 'اسم المشارك كما يظهر في البرنامج',
  student_id  VARCHAR(14)  NULL DEFAULT NULL         COMMENT 'ربط اختياري بسجل الطالب',
  PRIMARY KEY (id),
  KEY idx_parts_activity (activity_id),
  KEY idx_parts_student (student_id),
  CONSTRAINT fk_parts_activity
    FOREIGN KEY (activity_id) REFERENCES festival_activities (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_parts_student
    FOREIGN KEY (student_id) REFERENCES students (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='المشاركون في عروض يوم الاختتام';

/* ═════════════════════════════════════════════════════════════════════════
   7) الجدول: readings — الزيادة في القراءة (وحدة مستقلة تماماً)
      kind: z = زيادة / m = مراجعة / h = حفظ
      ⚠ هذا الجدول لا علاقة له بجدول student_scores إطلاقاً —
        لا مفاتيح أجنبية بينهما ولا حسابات متبادلة (استقلال تام)
   ═════════════════════════════════════════════════════════════════════════ */
CREATE TABLE IF NOT EXISTS readings (
  id         VARCHAR(14)  NOT NULL                   COMMENT 'معرّف فريد',
  student_id VARCHAR(14)  NOT NULL                   COMMENT 'الطالب',
  kind       ENUM('z','m','h') NOT NULL              COMMENT 'نوع القراءة: زيادة / مراجعة / حفظ',
  surah      VARCHAR(60)  NOT NULL                   COMMENT 'اسم السورة',
  from_ayah  INT          NOT NULL                   COMMENT 'من الآية',
  to_ayah    INT          NOT NULL                   COMMENT 'إلى الآية',
  ayat_count INT          NOT NULL                   COMMENT 'عدد الآيات = إلى - من + 1 (مضمون بقيد)',
  listener   VARCHAR(100) NOT NULL DEFAULT ''        COMMENT 'المستمع (الأستاذ)',
  date       DATE         NOT NULL                   COMMENT 'تاريخ القراءة',
  note       VARCHAR(500) NOT NULL DEFAULT ''        COMMENT 'ملاحظة',
  created_at BIGINT       NOT NULL                   COMMENT 'وقت التسجيل (بالمللي ثانية)',
  PRIMARY KEY (id),
  KEY idx_readings_student_date (student_id, date),
  KEY idx_readings_kind (kind),
  CONSTRAINT fk_readings_student
    FOREIGN KEY (student_id) REFERENCES students (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_readings_range
    CHECK (from_ayah >= 1 AND to_ayah >= from_ayah
           AND ayat_count = to_ayah - from_ayah + 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='زيادة القراءة القرآنية — وحدة مستقلة لا تدخل في الدرجات';

/* ═════════════════════════════════════════════════════════════════════════
   8) الجدول: settings — إعدادات النظام (اسم المدرسة، تاريخ المهرجانية…)
   ═════════════════════════════════════════════════════════════════════════ */
CREATE TABLE IF NOT EXISTS settings (
  `key`   VARCHAR(50) NOT NULL                      COMMENT 'اسم الإعداد',
  `value` TEXT        NULL                          COMMENT 'قيمة الإعداد',
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='إعدادات عامة على شكل مفتاح/قيمة';

/* ═════════════════════════════════════════════════════════════════════════
   9) الجدول: system_log — سجل العمليات (للمراقبة والمراجعة)
   ═════════════════════════════════════════════════════════════════════════ */
CREATE TABLE IF NOT EXISTS system_log (
  id     BIGINT       NOT NULL AUTO_INCREMENT,
  at     BIGINT       NOT NULL                      COMMENT 'وقت العملية (بالمللي ثانية)',
  `by`   VARCHAR(100) NOT NULL DEFAULT ''           COMMENT 'من نفّذ العملية',
  action VARCHAR(300) NOT NULL                      COMMENT 'وصف العملية',
  PRIMARY KEY (id),
  KEY idx_log_at (at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='سجل العمليات لآخر 200 حركة';

/* ═════════════════════════════════════════════════════════════════════════
   10) العروض (Views) — تقارير جاهزة بضغطة واحدة
   ═════════════════════════════════════════════════════════════════════════ */

/* نبض المواد: متوسط النسبة لكل مادة */
CREATE OR REPLACE VIEW v_subject_pulse AS
SELECT t.subject                                                AS subject,
       COUNT(sc.id)                                             AS score_count,
       ROUND(AVG(sc.score * 100.0 / t.max_score), 1)            AS avg_percent
FROM student_scores sc
JOIN tests t ON t.id = sc.test_id
GROUP BY t.subject;

/* ملخص الطالب: عدد الاختبارات والمتوسط */
CREATE OR REPLACE VIEW v_student_summary AS
SELECT st.id                                                      AS student_id,
       st.name                                                    AS student_name,
       st.level                                                   AS level,
       COUNT(sc.id)                                               AS tests_taken,
       ROUND(AVG(sc.score * 100.0 / t.max_score), 1)              AS avg_percent
FROM students st
LEFT JOIN student_scores sc ON sc.student_id = st.id
LEFT JOIN tests t          ON t.id = sc.test_id
GROUP BY st.id, st.name, st.level;

/* لوحة صدارة القراءة: مجموع الآيات لكل طالب (وحدة الزيادة المستقلة) */
CREATE OR REPLACE VIEW v_reading_leaderboard AS
SELECT st.id            AS student_id,
       st.name          AS student_name,
       COUNT(r.id)      AS sessions,
       SUM(r.ayat_count) AS total_ayat
FROM readings r
JOIN students st ON st.id = r.student_id
GROUP BY st.id, st.name;

/* نظرة عامة على الاختبارات: عدد المشاركين والمتوسط */
CREATE OR REPLACE VIEW v_test_overview AS
SELECT t.id                                       AS test_id,
       t.title                                    AS title,
       t.level                                    AS level,
       t.subject                                  AS subject,
       t.max_score                                AS max_score,
       t.date                                     AS test_date,
       COUNT(sc.id)                               AS scored_students,
       ROUND(AVG(sc.score * 100.0 / t.max_score), 1) AS avg_percent
FROM tests t
LEFT JOIN student_scores sc ON sc.test_id = t.id
GROUP BY t.id, t.title, t.level, t.subject, t.max_score, t.date;

/* ═════════════════════════════════════════════════════════════════════════
   11) البيانات الأولية (Seed Data)
   ═════════════════════════════════════════════════════════════════════════ */
SET @ms = UNIX_TIMESTAMP() * 1000;   -- طابع زمني موحد بالمللي ثانية

/* ── 11-أ) الحسابات ─────────────────────────────────────────────────────
   ⚠  password_hash أدناه قيم مؤقتة (PLACEHOLDER) يجب استبدالها بتجزئة
      bcrypt حقيقية قبل التشغيل. طريقة التوليد بعد تثبيت bcryptjs:

      node -e "console.log(require('bcryptjs').hashSync('095793',10))"

      ثم تطبيق الناتج:
      UPDATE users SET password_hash='<الناتج>' WHERE username='kiar';

      (الملف الخامس يتضمن سكربت تهيئة يقوم بذلك تلقائياً عند أول تشغيل)
───────────────────────────────────────────────────────────────────────── */
INSERT INTO users (id, username, password_hash, name, role, subject, active, created_at) VALUES
('u1', 'kiar',    '$2a$10$REPLACE_WITH_REAL_BCRYPT_HASH_BEFORE_USE_000000', 'كيار',            'owner',   'الإشراف العام',           1, @ms),
('u2', 'jehad',   '$2a$10$REPLACE_WITH_REAL_BCRYPT_HASH_BEFORE_USE_000001', 'أ. جهاد أحمد',    'teacher', 'القرآن الكريم والتجويد',  1, @ms),
('u3', 'hassan',  '$2a$10$REPLACE_WITH_REAL_BCRYPT_HASH_BEFORE_USE_000002', 'أ. حسن',          'teacher', 'الفقه',                   1, @ms),
('u4', 'mnour',   '$2a$10$REPLACE_WITH_REAL_BCRYPT_HASH_BEFORE_USE_000003', 'أ. محمد نور سبو', 'teacher', 'العقيدة',                 1, @ms),
('u5', 'mhassan', '$2a$10$REPLACE_WITH_REAL_BCRYPT_HASH_BEFORE_USE_000004', 'أ. محمد حسن',     'teacher', 'السيرة النبوية',          1, @ms),
('u6', 'kamal',   '$2a$10$REPLACE_WITH_REAL_BCRYPT_HASH_BEFORE_USE_000005', 'أ. خيار كمال',    'teacher', 'القرآن — قسم الصغار',     1, @ms);

/* ── 11-ب) الطلاب (كبار + صغار) ──────────────────────────────────────── */
INSERT INTO students (id, name, level, teacher_id, guardian, phone, notes, created_at) VALUES
('s1',  'ዩሱፍ አማን',     'senior', 'u2', 'አማን ሀሰን',    '0911223344', '', @ms),
('s2',  'አሕመድ ኑር',     'senior', 'u3', 'ኑር ጃሚል',     '0912233455', '', @ms),
('s3',  'ሐናን ተወፍቅ',    'senior', 'u4', 'ተወፍቅ ግርማ',   '0913344566', '', @ms),
('s4',  'ቢላል ሁሴን',     'senior', 'u5', 'ሁሴን አሊ',     '0914455677', '', @ms),
('s5',  'ፋጢማ አቡበከር',   'senior', 'u6', 'አቡበከር ኦመር',  '0915566788', '', @ms),
('s6',  'ኦስማን መሀመድ',   'senior', 'u2', 'መሀመድ እውነት',  '0916677899', '', @ms),
('s7',  'ሰላማዊት ከበደ',   'junior', 'u6', 'ከበደ ወልደ',    '0917788900', '', @ms),
('s8',  'ዑመር አሊ',      'junior', 'u5', 'አሊ ሙሳ',      '0918899011', '', @ms),
('s9',  'ደስታ ወልደ',     'junior', 'u3', 'ወልደ ኪሮስ',    '0919900122', '', @ms),
('s10', 'ሚና ሀሰን',      'junior', 'u4', 'ሀሰን ጃብር',    '0921011233', '', @ms),
('s11', 'ኢብራሂም ጃማል',   'junior', 'u2', 'ጃማል ዑመር',     '0922122344', '', @ms),
('s12', 'ሩት አሕመድ',     'junior', 'u6', 'አሕመድ ነጋ',    '0923233455', '', @ms);

/* ── 11-ج) الاختبارات (الكبار: قرآني + 6 مواد / الصغار: قرآني أساسي) ──── */
INSERT INTO tests (id, title, subject, type, level, max_score, date, created_by, created_at) VALUES
('t1', 'الاختبار القرآني الشامل — حفظ وتلاوة', 'quran',   'quran',   'senior', 100.00, DATE_SUB(CURDATE(), INTERVAL 3 DAY), 'كيار',            @ms),
('t2', 'اختبار الفقه — الطهارة والصلاة',       'fiqh',    'subject', 'senior',  25.00, DATE_SUB(CURDATE(), INTERVAL 5 DAY), 'أ. حسن',          @ms),
('t3', 'اختبار العقيدة — أركان الإيمان',       'aqidah',  'subject', 'senior',  25.00, DATE_SUB(CURDATE(), INTERVAL 6 DAY), 'أ. محمد نور سبو', @ms),
('t4', 'اختبار السيرة النبوية',                'sirah',   'subject', 'senior',  25.00, DATE_SUB(CURDATE(), INTERVAL 7 DAY), 'أ. محمد حسن',     @ms),
('t5', 'اختبار التجويد — أحكام التلاوة',       'tajweed', 'subject', 'senior',  10.00, DATE_SUB(CURDATE(), INTERVAL 4 DAY), 'أ. جهاد أحمد',    @ms),
('t6', 'اختبار الأخلاق والآداب',               'akhlaq',  'subject', 'senior',  10.00, DATE_SUB(CURDATE(), INTERVAL 2 DAY), 'أ. جهاد أحمد',    @ms),
('t7', 'اختبار الحديث — الأربعون النووية',     'hadith',  'subject', 'senior',  25.00, DATE_SUB(CURDATE(), INTERVAL 1 DAY), 'أ. محمد حسن',     @ms),
('t8', 'الاختبار القرآني الأساسي — جزء عمّ',   'quran',   'quran',   'junior',  20.00, DATE_SUB(CURDATE(), INTERVAL 3 DAY), 'أ. خيار كمال',    @ms);

/* ── 11-د) الدرجات الأولية ───────────────────────────────────────────── */
INSERT INTO student_scores (id, test_id, student_id, score, note, entered_by, updated_at) VALUES
/* t1 — الاختبار القرآني الشامل (من 100) — الكبار */
('c1',  't1', 's1', 92.0, '', 'كيار',         @ms),
('c2',  't1', 's2', 78.0, '', 'كيار',         @ms),
('c3',  't1', 's3', 88.0, '', 'كيار',         @ms),
('c4',  't1', 's4', 95.0, '', 'كيار',         @ms),
('c5',  't1', 's5', 70.0, '', 'كيار',         @ms),
('c6',  't1', 's6', 85.0, '', 'كيار',         @ms),
/* t2 — الفقه (من 25) */
('c7',  't2', 's1', 20.0, '', 'أ. حسن',       @ms),
('c8',  't2', 's2', 22.0, '', 'أ. حسن',       @ms),
('c9',  't2', 's3', 18.0, '', 'أ. حسن',       @ms),
('c10', 't2', 's4', 24.0, '', 'أ. حسن',       @ms),
('c11', 't2', 's5', 17.0, '', 'أ. حسن',       @ms),
('c12', 't2', 's6', 21.0, '', 'أ. حسن',       @ms),
/* t3 — العقيدة (من 25) */
('c13', 't3', 's1', 23.0, '', 'أ. محمد نور سبو', @ms),
('c14', 't3', 's2', 19.0, '', 'أ. محمد نور سبو', @ms),
('c15', 't3', 's3', 25.0, 'إجابة كاملة', 'أ. محمد نور سبو', @ms),
('c16', 't3', 's4', 20.0, '', 'أ. محمد نور سبو', @ms),
('c17', 't3', 's5', 16.0, '', 'أ. محمد نور سبو', @ms),
('c18', 't3', 's6', 22.0, '', 'أ. محمد نور سبو', @ms),
/* t4 — السيرة (من 25) */
('c19', 't4', 's1', 24.0, '', 'أ. محمد حسن',  @ms),
('c20', 't4', 's2', 20.0, '', 'أ. محمد حسن',  @ms),
('c21', 't4', 's3', 21.0, '', 'أ. محمد حسن',  @ms),
('c22', 't4', 's4', 23.0, '', 'أ. محمد حسن',  @ms),
('c23', 't4', 's5', 18.0, '', 'أ. محمد حسن',  @ms),
('c24', 't4', 's6', 19.0, '', 'أ. محمد حسن',  @ms),
/* t5 — التجويد (من 10) */
('c25', 't5', 's1',  9.0, '', 'أ. جهاد أحمد', @ms),
('c26', 't5', 's2',  7.0, '', 'أ. جهاد أحمد', @ms),
('c27', 't5', 's3',  8.0, '', 'أ. جهاد أحمد', @ms),
('c28', 't5', 's4', 10.0, 'تلاوة متقنة', 'أ. جهاد أحمد', @ms),
('c29', 't5', 's5',  6.0, '', 'أ. جهاد أحمد', @ms),
('c30', 't5', 's6',  8.0, '', 'أ. جهاد أحمد', @ms),
/* t6 — الأخلاق (من 10) */
('c31', 't6', 's1',  9.0, '', 'أ. جهاد أحمد', @ms),
('c32', 't6', 's2', 10.0, '', 'أ. جهاد أحمد', @ms),
('c33', 't6', 's3',  8.0, '', 'أ. جهاد أحمد', @ms),
('c34', 't6', 's4',  9.0, '', 'أ. جهاد أحمد', @ms),
('c35', 't6', 's5',  8.0, '', 'أ. جهاد أحمد', @ms),
('c36', 't6', 's6',  7.0, '', 'أ. جهاد أحمد', @ms),
/* t7 — الحديث (من 25) */
('c37', 't7', 's1', 22.0, '', 'أ. محمد حسن',  @ms),
('c38', 't7', 's2', 20.0, '', 'أ. محمد حسن',  @ms),
('c39', 't7', 's3', 24.0, '', 'أ. محمد حسن',  @ms),
('c40', 't7', 's4', 21.0, '', 'أ. محمد حسن',  @ms),
('c41', 't7', 's5', 19.0, '', 'أ. محمد حسن',  @ms),
('c42', 't7', 's6', 23.0, '', 'أ. محمد حسن',  @ms),
/* t8 — الاختبار القرآني الأساسي (من 20) — الصغار */
('c43', 't8', 's7', 18.0, '', 'أ. خيار كمال', @ms),
('c44', 't8', 's8', 16.0, '', 'أ. خيار كمال', @ms),
('c45', 't8', 's9', 19.0, '', 'أ. خيار كمال', @ms),
('c46', 't8', 's10', 15.0, '', 'أ. خيار كمال', @ms),
('c47', 't8', 's11', 17.0, '', 'أ. خيار كمال', @ms),
('c48', 't8', 's12', 20.0, 'حفظ متقن', 'أ. خيار كمال', @ms);

/* ── 11-هـ) برنامج المهرجانية (يوم اختتام الصيف) ──────────────────────── */
INSERT INTO festival_activities (id, section, title, description, minutes, sort_order, created_at) VALUES
/* قسم الكبار */
('a1',  'senior', 'قصص الصحابة',            'قصة صحابي يختارها الطالب بنفسه',                        5, 1,  @ms),
('a2',  'senior', 'الشعر — الإلقاء',         'قصيدة في حب القرآن',                                     4, 2,  @ms),
('a3',  'senior', 'الخطبة',                 'خطبة قصيرة أمام الحضور',                                 6, 3,  @ms),
('a4',  'senior', 'فضائل القرآن',           'كلمة في فضل قراءة القرآن',                               5, 4,  @ms),
('a5',  'senior', 'الفقه — سؤال وجواب',     'مسائل فقهية بتحضير ذاتي (طالبان)',                       8, 5,  @ms),
('a6',  'senior', 'العقيدة — تحضير ذاتي',   'عرض مسألة عقائدية بتحضير ذاتي',                          6, 6,  @ms),
('a7',  'senior', 'السيرة النبوية',          'موقف مختار من سيرة المصطفى ﷺ',                          5, 7,  @ms),
('a8',  'senior', 'التجويد',                'تلاوة مجوَّدة مع بيان الأحكام',                           6, 8,  @ms),
/* قسم الصغار */
('a9',  'junior', 'العقيدة — سؤال وجواب',   'أسئلة عقائدية مبسطة',                                    5, 9,  @ms),
('a10', 'junior', 'الفقه — كيفية الصلاة',   'سؤال وجواب + عرض عملي لكيفية الصلاة',                    7, 10, @ms),
('a11', 'junior', 'السيرة',                 'قصة قصيرة من السيرة',                                    4, 11, @ms),
('a12', 'junior', 'التجويد',                'تلاوة قصيرة مراعية للأحكام',                             4, 12, @ms),
('a13', 'junior', 'الأخلاق',                'كلمة قصيرة عن خُلق حسن',                                 3, 13, @ms),
('a14', 'junior', 'القرآن الكريم — الحفظ',  'عرض تحفيظ قصار السور أمام الناس',                        10, 14, @ms),
('a15', 'junior', 'القرآن الكريم — القاعدة النورانية',
                 'الحروف الهجائية + الدرس الرابع والخامس: أبدا، أحد، أخذ، أذن، أمر — ليسمعوها للناس', 8, 15, @ms);

/* المشاركون (مرتبطون بسجل الطلاب) */
INSERT INTO festival_participants (id, activity_id, name, student_id) VALUES
/* قسم الكبار */
('a1p1',  'a1',  'ዩሱፍ አማን',     's1'),
('a2p1',  'a2',  'ሐናን ተወፍቅ',    's3'),
('a3p1',  'a3',  'አሕመድ ኑር',     's2'),
('a4p1',  'a4',  'ፋጢማ አቡበከር',   's5'),
('a5p1',  'a5',  'ቢላል ሁሴን',     's4'),
('a5p2',  'a5',  'ኦስማን መሀመድ',   's6'),
('a6p1',  'a6',  'ዩሱፍ አማን',     's1'),
('a7p1',  'a7',  'ቢላል ሁሴን',     's4'),
('a8p1',  'a8',  'ኦስማን መሀመድ',   's6'),
/* قسم الصغار */
('a9p1',  'a9',  'ሰላማዊት ከበደ',   's7'),
('a9p2',  'a9',  'ዑመር አሊ',      's8'),
('a10p1', 'a10', 'ደስታ ወልደ',     's9'),
('a10p2', 'a10', 'ሚና ሀሰን',      's10'),
('a11p1', 'a11', 'ኢብራሂም ጃማል',   's11'),
('a12p1', 'a12', 'ሩት አሕመድ',     's12'),
('a13p1', 'a13', 'ዑመር አሊ',      's8'),
('a14p1', 'a14', 'ሰላማዊት ከበደ',   's7'),
('a14p2', 'a14', 'ደስታ ወልደ',     's9'),
('a14p3', 'a14', 'ሚና ሀሰን',      's10'),
('a14p4', 'a14', 'ኢብራሂም ጃማል',   's11'),
('a14p5', 'a14', 'ሩት አሕመድ',     's12'),
('a14p6', 'a14', 'ዑመር አሊ',      's8'),
('a15p1', 'a15', 'ሩት አሕመድ',     's12'),
('a15p2', 'a15', 'ኢብራሂም ጃማል',   's11');

/* ── 11-و) زيادة القراءة (وحدة مستقلة — لا تتدخل بالدرجات) ────────────── */
INSERT INTO readings (id, student_id, kind, surah, from_ayah, to_ayah, ayat_count, listener, date, note, created_at) VALUES
('r1',  's1',  'z', 'البقرة',    1, 20, 20, 'أ. جهاد أحمد',  DATE_SUB(CURDATE(), INTERVAL 2 DAY), 'قراءة متقنة', @ms),
('r2',  's1',  'm', 'الكهف',     1, 10, 10, 'أ. جهاد أحمد',  DATE_SUB(CURDATE(), INTERVAL 1 DAY), '',            @ms),
('r3',  's2',  'z', 'آل عمران', 15, 35, 21, 'أ. جهاد أحمد',  DATE_SUB(CURDATE(), INTERVAL 2 DAY), '',            @ms),
('r4',  's3',  'h', 'يس',        1, 25, 25, 'أ. محمد حسن',   DATE_SUB(CURDATE(), INTERVAL 3 DAY), 'حفظ جديد',    @ms),
('r5',  's4',  'm', 'الملك',     1, 20, 20, 'أ. محمد حسن',   DATE_SUB(CURDATE(), INTERVAL 4 DAY), '',            @ms),
('r6',  's5',  'z', 'ق',         1, 20, 20, 'أ. خيار كمال',  DATE_SUB(CURDATE(), INTERVAL 1 DAY), '',            @ms),
('r7',  's7',  'z', 'النبأ',     1, 15, 15, 'أ. خيار كمال',  DATE_SUB(CURDATE(), INTERVAL 2 DAY), '',            @ms),
('r8',  's11', 'h', 'الفجر',     1, 10, 10, 'أ. جهاد أحمد',  DATE_SUB(CURDATE(), INTERVAL 1 DAY), '',            @ms),
('r9',  's12', 'z', 'الشرح',     1,  8,  8, 'أ. خيار كمال',  DATE_SUB(CURDATE(), INTERVAL 3 DAY), '',            @ms),
('r10', 's6',  'm', 'الرحمن',    1, 15, 15, 'أ. جهاد أحمد',  DATE_SUB(CURDATE(), INTERVAL 2 DAY), '',            @ms);

/* ── 11-ز) الإعدادات وسجل البداية ────────────────────────────────────── */
INSERT INTO settings (`key`, `value`) VALUES
('schoolName',   ''),
('festivalDate', DATE_ADD(CURDATE(), INTERVAL 21 DAY));

INSERT INTO system_log (at, `by`, action) VALUES
(@ms, 'كيار', 'تهيئة النظام وإدخال البيانات الأساسية');

/* ═════════════════════════════════════════════════════════════════════════
   12) (اختياري) مستخدم قاعدة بيانات مخصص للتطبيق — أزل التعليق وفعّله
   ═════════════════════════════════════════════════════════════════════════
CREATE USER IF NOT EXISTS 'nour_app'@'localhost'
  IDENTIFIED BY 'ضع_كلمة_مرور_قوية_هنا';
GRANT SELECT, INSERT, UPDATE, DELETE ON nour_school.* TO 'nour_app'@'localhost';
FLUSH PRIVILEGES;
═════════════════════════════════════════════════════════════════════════ */

/* ═════════════════════════════════════════════════════════════════════════
   13) فحوصات التحقق بعد التثبيت (شغّلها يدوياً للتأكد)
   ═════════════════════════════════════════════════════════════════════════
   SELECT COUNT(*) AS users_count      FROM users;            -- المتوقع: 6
   SELECT COUNT(*) AS students_count   FROM students;         -- المتوقع: 12
   SELECT COUNT(*) AS tests_count      FROM tests;            -- المتوقع: 8
   SELECT COUNT(*) AS scores_count     FROM student_scores;   -- المتوقع: 48
   SELECT COUNT(*) AS activities_count FROM festival_activities;      -- المتوقع: 15
   SELECT COUNT(*) AS participants_count FROM festival_participants;  -- المتوقع: 24
   SELECT COUNT(*) AS readings_count   FROM readings;         -- المتوقع: 10

   SELECT * FROM v_subject_pulse;        -- نبض المواد
   SELECT * FROM v_student_summary;      -- ملخص كل طالب
   SELECT * FROM v_reading_leaderboard;  -- صدارة القراءة
   SELECT * FROM v_test_overview;        -- نظرة على الاختبارات
═════════════════════════════════════════════════════════════════════════ */

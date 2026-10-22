-- ======================================================
-- File Name : seed-admin.sql
-- Purpose   : Roles, users, report catalog and sample generated reports.
--             Values live ONLY here / in the DB - no copy in server code.
--             Prototype note: passwords are plaintext (same as before).
-- Safe to re-run: inserts only when users is empty.
-- ======================================================
INSERT INTO roles (name, "userCount", access, permissions) VALUES
('Administrator', 5, 'Full access · user & config management', '{"viewAssets":true,"postEvents":true,"approvePost":true,"runReports":true,"manageUsers":true,"editConfig":true}'),
('Tax Analyst', 18, 'Post events · run calcs · reporting', '{"viewAssets":true,"postEvents":true,"approvePost":false,"runReports":true,"manageUsers":false,"editConfig":false}'),
('Reviewer', 14, 'Approve transactions · view all', '{"viewAssets":true,"postEvents":false,"approvePost":true,"runReports":true,"manageUsers":false,"editConfig":false}'),
('Read-Only', 10, 'View assets & reports only', '{"viewAssets":true,"postEvents":false,"approvePost":false,"runReports":true,"manageUsers":false,"editConfig":false}')
ON CONFLICT (name) DO NOTHING;

INSERT INTO users (id, name, email, role, "lastActive", status, password, "menuAccess")
SELECT * FROM (VALUES
('u1', 'Balaji A.', 'balaji.a@company.com', 'Administrator', 'Just now', 'Active', 'changeme123', '{}'),
('u2', 'Jordan S.', 'jordan.s@company.com', 'Tax Analyst', '2 hours ago', 'Active', 'changeme123', '{}'),
('u3', 'Maria R.', 'maria.r@company.com', 'Reviewer', 'Yesterday', 'Active', 'changeme123', '{}'),
('u4', 'Tom P.', 'tom.p@company.com', 'Read-Only', '3 days ago', 'Invited', 'changeme123', '{}')
) AS v(id, name, email, role, "lastActive", status, password, "menuAccess")
WHERE NOT EXISTS (SELECT 1 FROM users)
ON CONFLICT (id) DO NOTHING;

INSERT INTO report_catalog (key, name, description) VALUES
('depreciation-detail', 'Depreciation Detail', 'Per-asset depreciation by book and period'),
('roll-forward', 'Roll-Forward', 'Cost & accum. depreciation continuity'),
('form-4562', 'Tax Form 4562', 'Depreciation & amortization filing')
ON CONFLICT (key) DO NOTHING;

INSERT INTO generated_reports (name, book, period, "generatedBy", "reportDate", format, status)
SELECT * FROM (VALUES
('Depreciation Detail — Q1', 'Federal Tax', '2026 Q1', 'Balaji A.', DATE '2026-04-22', 'XLSX', 'Ready'),
('Roll-Forward Summary', 'GAAP', 'APR-26', 'System', DATE '2026-04-21', 'PDF', 'Ready'),
('Tax Form 4562 Draft', 'Federal Tax', 'FY2026', 'Balaji A.', DATE '2026-04-18', 'PDF', 'Draft')
) AS v(name, book, period, "generatedBy", "reportDate", format, status)
WHERE NOT EXISTS (SELECT 1 FROM generated_reports);

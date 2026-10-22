-- ======================================================
-- File Name : seed-activity.sql
-- Purpose   : Dashboard "Recent Activity" rows (was recentActivity in data/activity.ts).
--             Table lifecycle_activity is created by db/schema.sql.
-- Safe to re-run: inserts only when the table is empty.
-- ======================================================
INSERT INTO lifecycle_activity ("assetNumber", description, event, amount, "eventDate", status)
SELECT * FROM (VALUES
('845862189', 'Network Rack — AWS AFS', 'Adjustment', 882.26, DATE '2026-04-21', 'Posted'),
('846013895', 'Data Center HVAC Unit', 'Addition', 357772.1, DATE '2026-04-06', 'Posted'),
('845990931', 'Fiber Transceiver Module', 'Transfer In', 5710.33, DATE '2026-04-04', 'Processing'),
('846321878', 'Temporary Test Rig', 'Retirement', 60566.32, DATE '2026-04-21', 'Pending'),
('845009019', 'Cooling Loop Assembly', 'Reclassification', 972.73, DATE '2026-04-18', 'Posted')
) AS v("assetNumber", description, event, amount, "eventDate", status)
WHERE NOT EXISTS (SELECT 1 FROM lifecycle_activity);

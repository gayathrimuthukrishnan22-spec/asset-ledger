-- ======================================================
-- File Name : cleanup-legacy-custom-rows.sql
-- Purpose   : OPTIONAL one-time cleanup. Removes the 3 old starter rows that the
--             Customize Table used to be seeded with (only if still exactly as
--             seeded - an edited row is a real rule and is kept).
--             Replaces the LEGACY_STARTER_ROWS code that ran inside the server.
-- ======================================================
DELETE FROM asset_class_custom_table
 WHERE book = 'GAAP' AND "propertyType" = 'PP - Personal Property' AND method = 'SL - Straight Line'
   AND "ratePct" = '100' AND convention = 'FM - Full-Month'
   AND (("assetType" = 'Acquisition' AND life = '0 years 0 months')
     OR ("assetType" = 'Alternative Energy Property' AND life = '10 years 0 months')
     OR ("assetType" = 'Alternative Energy Property - ADS' AND life = '10 years 0 months'));

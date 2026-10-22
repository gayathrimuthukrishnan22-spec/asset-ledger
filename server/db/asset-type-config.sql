-- asset_type_config : run this ONCE in the Neon SQL editor
CREATE TABLE IF NOT EXISTS asset_type_config
(
    code            TEXT PRIMARY KEY,
    label           TEXT NOT NULL UNIQUE,
    "propertyType"  TEXT NOT NULL,
    method          TEXT NOT NULL,
    convention      TEXT NOT NULL,
    rate            NUMERIC NOT NULL DEFAULT 0,
    "sortOrder"     INTEGER NOT NULL DEFAULT 0,
    active          BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO asset_type_config (code, label, "propertyType", method, convention, rate, "sortOrder") VALUES
('GDS-3', 'Personal Property 3yr MACRS 200% DB (GDS)', 'Personal Property', 'MACRS', 'HY', 2, 0),
('GDS-5', 'Personal Property 5yr MACRS 200% DB (GDS)', 'Personal Property', 'MACRS', 'HY', 2, 1),
('GDS-7', 'Personal Property 7yr MACRS 200% DB (GDS)', 'Personal Property', 'MACRS', 'HY', 2, 2),
('GDS-10', 'Personal Property 10yr MACRS 200% DB (GDS)', 'Personal Property', 'MACRS', 'HY', 2, 3),
('GDS-15', 'Personal Property 15yr MACRS 150% DB (GDS)', 'Personal Property', 'MACRS', 'HY', 1.5, 4),
('GDS-20', 'Personal Property 20yr MACRS 150% DB (GDS)', 'Personal Property', 'MACRS', 'HY', 1.5, 5),
('GDS-27.5', 'Residential Rental 27.5yr SL Mid-Month (GDS)', 'Residential Rental', 'MACRS Straight-Line', 'Mid-Month', 1, 6),
('GDS-31.5', 'Nonresidential Real 31.5yr SL Mid-Month (GDS)', 'Non-Residential Real', 'MACRS Straight-Line', 'Mid-Month', 1, 7),
('GDS-39', 'Nonresidential Real 39yr SL Mid-Month (GDS)', 'Non-Residential Real', 'MACRS Straight-Line', 'Mid-Month', 1, 8),
('GDS150-3', 'Personal Property 3yr 150% DB (GDS)', 'Personal Property', 'MACRS 150DB', 'HY', 1.5, 9),
('GDS150-5', 'Personal Property 5yr 150% DB (GDS)', 'Personal Property', 'MACRS 150DB', 'HY', 1.5, 10),
('GDS150-7', 'Personal Property 7yr 150% DB (GDS)', 'Personal Property', 'MACRS 150DB', 'HY', 1.5, 11),
('GDS150-10', 'Personal Property 10yr 150% DB (GDS)', 'Personal Property', 'MACRS 150DB', 'HY', 1.5, 12),
('ADS-3', 'Personal Property 3yr SL (ADS)', 'Personal Property', 'MACRS ADS', 'HY', 1, 13),
('ADS-5', 'Personal Property 5yr SL (ADS)', 'Personal Property', 'MACRS ADS', 'HY', 1, 14),
('ADS-9', 'Personal Property 9yr SL (ADS)', 'Personal Property', 'MACRS ADS', 'HY', 1, 15),
('ADS-10', 'Personal Property 10yr SL (ADS)', 'Personal Property', 'MACRS ADS', 'HY', 1, 16),
('ADS-12', 'Personal Property 12yr SL (ADS)', 'Personal Property', 'MACRS ADS', 'HY', 1, 17),
('ADS-20', 'Personal Property 20yr SL (ADS)', 'Personal Property', 'MACRS ADS', 'HY', 1, 18),
('ADS-25', 'Personal Property 25yr SL (ADS)', 'Personal Property', 'MACRS ADS', 'HY', 1, 19),
('ADS-30', 'Residential Rental 30yr SL Mid-Month (ADS)', 'Residential Rental', 'MACRS ADS', 'Mid-Month', 1, 20),
('ADS-40', 'Nonresidential Real 40yr SL Mid-Month (ADS)', 'Non-Residential Real', 'MACRS ADS', 'Mid-Month', 1, 21),
('GDS-5-WBC', 'Personal Property 5yr MACRS (WBC)', 'Personal Property', 'MACRS', 'HY', 2, 22),
('GDS-5-UK', 'Personal Property 5yr MACRS (UK - 57)', 'Personal Property', 'MACRS', 'HY', 2, 23),
('NONE', 'Book Only — No Depreciation', 'Non-Depreciable', 'None', 'HY', 0, 24)
ON CONFLICT (code) DO NOTHING;

-- check
SELECT count(*) FROM asset_type_config;

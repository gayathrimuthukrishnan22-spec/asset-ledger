-- Reference only: the server creates this table automatically on first use.
CREATE TABLE IF NOT EXISTS integration_imports (
  source        TEXT        NOT NULL,
  external_ref  TEXT        NOT NULL,
  asset_number  TEXT        NOT NULL,
  imported_by   TEXT        NOT NULL,
  imported_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source, external_ref)
);

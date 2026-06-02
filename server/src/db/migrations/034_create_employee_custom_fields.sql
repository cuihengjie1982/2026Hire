-- Employee custom field definitions and values
-- Supports dynamic fields created manually or via Excel import

-- 1. Custom field definitions (global, reusable across all employees)
CREATE TABLE employee_custom_field_defs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key   VARCHAR(100) NOT NULL UNIQUE,
  field_label VARCHAR(200) NOT NULL,
  field_type  VARCHAR(20) NOT NULL DEFAULT 'text'
              CHECK (field_type IN ('text', 'number', 'date', 'select', 'multiselect', 'boolean')),
  options     JSONB DEFAULT '[]',           -- for select/multiselect: [{label, value}]
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  source      VARCHAR(20) NOT NULL DEFAULT 'manual'
              CHECK (source IN ('manual', 'excel_import')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_custom_field_defs_active ON employee_custom_field_defs(is_active);

-- 2. Custom field values (one row per employee per field)
CREATE TABLE employee_custom_field_values (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
  field_id    UUID NOT NULL REFERENCES employee_custom_field_defs(id) ON DELETE CASCADE,
  value_text  TEXT,
  value_num   NUMERIC,
  value_date  DATE,
  value_json  JSONB,                        -- for multiselect / complex values
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(employee_id, field_id)
);

CREATE INDEX idx_custom_field_values_employee ON employee_custom_field_values(employee_id);
CREATE INDEX idx_custom_field_values_field    ON employee_custom_field_values(field_id);

-- Employee profile version history / change tracking
-- Records field-level diffs with full snapshots for point-in-time reconstruction

CREATE TABLE employee_profile_history (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       UUID NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
  action            VARCHAR(30) NOT NULL DEFAULT 'update'
                    CHECK (action IN ('create', 'update', 'delete', 'status_change')),
  field_name        VARCHAR(100),                -- null for create/delete
  old_value         TEXT,
  new_value         TEXT,
  field_label       VARCHAR(200),                -- human-readable Chinese label
  changed_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  changed_by_email  VARCHAR(255),
  changed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  snapshot          JSONB                        -- full employee row snapshot at this point
);

CREATE INDEX idx_profile_history_employee  ON employee_profile_history(employee_id);
CREATE INDEX idx_profile_history_changed   ON employee_profile_history(changed_at DESC);
CREATE INDEX idx_profile_history_action    ON employee_profile_history(action);

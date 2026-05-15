ALTER TABLE projects ADD COLUMN description TEXT;
ALTER TABLE projects ADD COLUMN created_by UUID REFERENCES users(id);
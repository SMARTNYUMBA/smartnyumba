USE smartnyumba;
ALTER TABLE visitors ADD COLUMN host_user_id INT DEFAULT NULL AFTER host_name,
  ADD FOREIGN KEY fk_visitor_host (host_user_id) REFERENCES users(id) ON DELETE SET NULL;
SELECT 'Migration v2b done' AS status;


USE smartnyumba;
-- Add owner user if not exists  
INSERT IGNORE INTO users (id, full_name, email, phone, password_hash, role, is_active) VALUES
(10, 'Mark Mutwiwa', 'owner@smartnyumba.com', '0715662332', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGwa6a5KtSPvZVj04WQOC.4vTOq', 'owner', 1);
-- Password: Owner@123
SELECT 'Owner user ready' AS status;


USE smartnyumba;
CREATE TABLE IF NOT EXISTS mpesa_transactions (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  checkout_request_id  VARCHAR(100) UNIQUE NOT NULL,
  invoice_id           INT NOT NULL,
  tenancy_id           INT NOT NULL,
  phone                VARCHAR(20) NOT NULL,
  amount               DECIMAL(12,2) NOT NULL,
  status               ENUM('pending','completed','failed','cancelled') DEFAULT 'pending',
  transaction_code     VARCHAR(20) DEFAULT NULL,
  result_code          VARCHAR(10) DEFAULT NULL,
  result_desc          TEXT DEFAULT NULL,
  initiated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at         TIMESTAMP NULL,
  FOREIGN KEY (invoice_id)  REFERENCES invoices(id),
  FOREIGN KEY (tenancy_id)  REFERENCES tenancies(id)
) ENGINE=InnoDB;
SELECT 'mpesa_transactions table ready' AS status;

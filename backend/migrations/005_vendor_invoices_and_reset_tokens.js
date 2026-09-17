'use strict';

module.exports = {
  name: '005_vendor_invoices_and_password_reset',
  async up(pool) {
    // Vendor invoices
    await pool.query(`
      CREATE TABLE IF NOT EXISTS vendor_invoices (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        vendor_id       INT NOT NULL,
        property_id     INT,
        maintenance_id  INT,
        invoice_ref     VARCHAR(100),
        description     TEXT,
        amount          DECIMAL(12,2) NOT NULL,
        tax_amount      DECIMAL(12,2) DEFAULT 0,
        total_amount    DECIMAL(12,2) NOT NULL,
        status          ENUM('pending','approved','paid','rejected') DEFAULT 'pending',
        invoice_date    DATE NOT NULL,
        due_date        DATE,
        paid_date       DATE,
        paid_by         INT,
        payment_ref     VARCHAR(100),
        notes           TEXT,
        document_url    VARCHAR(500),
        created_by      INT,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_vi_vendor   (vendor_id),
        INDEX idx_vi_property (property_id),
        INDEX idx_vi_status   (status)
      )
    `).catch(() => {});

    // Email password reset tokens
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        user_id    INT NOT NULL,
        token_hash VARCHAR(64) NOT NULL,
        expires_at DATETIME NOT NULL,
        used       TINYINT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_prt_hash    (token_hash),
        INDEX idx_prt_user    (user_id),
        INDEX idx_prt_expires (expires_at)
      )
    `).catch(() => {});

    // Webhooks table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS webhooks (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        url           VARCHAR(500) NOT NULL,
        events        JSON NOT NULL DEFAULT ('[]'),
        secret        VARCHAR(100) NOT NULL,
        is_active     TINYINT DEFAULT 1,
        description   VARCHAR(200),
        created_by    INT,
        fail_count    INT DEFAULT 0,
        last_fired_at DATETIME,
        last_error    TEXT,
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_wh_active (is_active)
      )
    `).catch(() => {});
  },
};

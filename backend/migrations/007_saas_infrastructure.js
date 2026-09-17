'use strict';
module.exports = {
  name: '007_saas_infrastructure',
  async up(pool) {
    const conn = await pool.getConnection();
    await conn.beginTransaction();
    try {
      await conn.query(`
        CREATE TABLE IF NOT EXISTS api_keys (
          id         INT AUTO_INCREMENT PRIMARY KEY,
          org_id     INT NOT NULL,
          name       VARCHAR(100) NOT NULL,
          key_hash   VARCHAR(64) NOT NULL UNIQUE,
          key_prefix CHAR(12) NOT NULL,
          role       VARCHAR(40) DEFAULT 'api_reader',
          scopes     JSON,
          last_used  DATETIME,
          expires_at DATETIME,
          is_active  TINYINT DEFAULT 1,
          created_by INT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_ak_org (org_id),
          INDEX idx_ak_hash (key_hash)
        ) ENGINE=InnoDB`);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS audit_events (
          id          BIGINT AUTO_INCREMENT PRIMARY KEY,
          org_id      INT NOT NULL DEFAULT 1,
          actor_id    INT,
          actor_role  VARCHAR(40),
          actor_email VARCHAR(200),
          action      VARCHAR(80) NOT NULL,
          resource    VARCHAR(60),
          resource_id INT,
          before_val  JSON,
          after_val   JSON,
          ip          VARCHAR(45),
          user_agent  VARCHAR(500),
          status_code SMALLINT,
          created_at  DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
          INDEX idx_ae_org_time (org_id, created_at),
          INDEX idx_ae_actor   (org_id, actor_id),
          INDEX idx_ae_resource(org_id, resource, resource_id)
        ) ENGINE=InnoDB`);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS message_queue (
          id         INT AUTO_INCREMENT PRIMARY KEY,
          org_id     INT NOT NULL DEFAULT 1,
          type       ENUM('sms','email','whatsapp','push') NOT NULL,
          recipient  VARCHAR(200) NOT NULL,
          subject    VARCHAR(255),
          body       TEXT NOT NULL,
          template   VARCHAR(80),
          payload    JSON,
          attempts   TINYINT DEFAULT 0,
          status     ENUM('pending','sent','failed') DEFAULT 'pending',
          error      TEXT,
          send_after DATETIME DEFAULT CURRENT_TIMESTAMP,
          sent_at    DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_mq_pending (status, attempts, send_after),
          INDEX idx_mq_org (org_id)
        ) ENGINE=InnoDB`);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS jobs (
          id         VARCHAR(36) PRIMARY KEY,
          org_id     INT NOT NULL DEFAULT 1,
          type       VARCHAR(60) NOT NULL,
          status     ENUM('queued','running','done','failed') DEFAULT 'queued',
          payload    JSON,
          result     JSON,
          error      TEXT,
          progress   TINYINT DEFAULT 0,
          created_by INT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          started_at DATETIME,
          done_at    DATETIME,
          INDEX idx_jobs_org_status (org_id, status),
          INDEX idx_jobs_created    (created_at)
        ) ENGINE=InnoDB`);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS receipt_sequences (
          year     YEAR PRIMARY KEY,
          next_val INT NOT NULL DEFAULT 1
        ) ENGINE=InnoDB`);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS sms_usage (
          org_id     INT NOT NULL,
          month_year CHAR(7) NOT NULL,
          count      INT DEFAULT 0,
          billed     INT DEFAULT 0,
          PRIMARY KEY (org_id, month_year)
        ) ENGINE=InnoDB`);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS platform_fees (
          id         INT AUTO_INCREMENT PRIMARY KEY,
          org_id     INT NOT NULL DEFAULT 1,
          payment_id INT NOT NULL,
          amount     DECIMAL(12,2) NOT NULL,
          rate       DECIMAL(6,4)  NOT NULL DEFAULT 0.005,
          billed     TINYINT DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_pf_org_billed (org_id, billed)
        ) ENGINE=InnoDB`);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS billing_invoices (
          id             INT AUTO_INCREMENT PRIMARY KEY,
          org_id         INT NOT NULL,
          amount         DECIMAL(12,2) NOT NULL,
          currency       CHAR(3) DEFAULT 'KES',
          description    VARCHAR(200),
          status         ENUM('pending','paid','failed','cancelled') DEFAULT 'pending',
          payment_ref    VARCHAR(100),
          billing_period CHAR(7),
          due_date       DATE,
          paid_at        DATETIME,
          created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_bi_org (org_id)
        ) ENGINE=InnoDB`);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS sse_tokens (
          token      VARCHAR(64) PRIMARY KEY,
          user_id    INT NOT NULL,
          org_id     INT NOT NULL DEFAULT 1,
          expires_at DATETIME NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_sse_user (user_id)
        ) ENGINE=InnoDB`);

      await conn.commit();
    } catch(e) { await conn.rollback(); throw e; }
    finally { conn.release(); }
  },
};

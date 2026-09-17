const pool = require('../../config/db');
const { ok, err, safeErr } = require('../../utils/helpers');

exports.getAll = async (req, res) => {
  try {
    // Every property must belong to the current organisation.
    let where = 'WHERE p.org_id=?';
    const params = [req.user.org_id];

    // Property manager: only see properties assigned to them.
    if (req.user.role === 'property_manager') {
      where += `
        AND (
          p.manager_id=?
          OR p.id IN (
            SELECT property_id
            FROM users
            WHERE id=?
              AND property_id IS NOT NULL
          )
        )
      `;
      params.push(req.user.sub, req.user.sub);
    }

    // Caretaker/security: only see their assigned property.
    else if (
      ['caretaker', 'security'].includes(req.user.role) &&
      req.user.property_id
    ) {
      where += ' AND p.id=?';
      params.push(req.user.property_id);
    }

    /*
     * IMPORTANT:
     *
     * Do NOT use:
     *
     *   SUM(un.status='occupied')
     *
     * here.
     *
     * The invoices JOIN can produce multiple rows for one unit, causing
     * occupied units to be counted repeatedly.
     *
     * COUNT(DISTINCT CASE WHEN ... THEN un.id END)
     * counts each physical unit only once.
     */

    const [rows] = await pool.query(
      `
      SELECT
        p.*,

        u.full_name AS manager_name,

        COUNT(DISTINCT un.id) AS total_units,

        COUNT(
          DISTINCT CASE
            WHEN un.status='occupied' THEN un.id
          END
        ) AS occupied_units,

        COUNT(
          DISTINCT CASE
            WHEN un.status='vacant' THEN un.id
          END
        ) AS vacant_units,

        COALESCE(
          SUM(
            CASE
              WHEN i.status IN ('unpaid','overdue','partial')
              THEN i.balance
              ELSE 0
            END
          ),
          0
        ) AS outstanding,

        /*
         * Potential monthly revenue is based on the rent amount
         * configured for every unit in this property.
         *
         * This is calculated in a separate subquery so invoice joins
         * cannot multiply the rent values.
         */
        COALESCE(
          (
            SELECT SUM(un2.rent_amount)
            FROM units un2
            WHERE un2.property_id=p.id
          ),
          0
        ) AS potential_monthly_revenue

      FROM properties p

      LEFT JOIN users u
        ON p.manager_id=u.id
       AND u.org_id=p.org_id

      LEFT JOIN units un
        ON p.id=un.property_id

      LEFT JOIN tenancies ten
        ON un.id=ten.unit_id
       AND ten.status='active'

      LEFT JOIN invoices i
        ON ten.id=i.tenancy_id
       AND i.status IN ('unpaid','overdue','partial')

      ${where}

      GROUP BY p.id

      ORDER BY p.name
      `,
      params
    );

    ok(res, { properties: rows });
  } catch (e) {
    safeErr(res, e);
  }
};


exports.create = async (req, res) => {
  try {
    const {
      name,
      location,
      address,
      description,
      manager_id,
      owner_id,
      management_fee_pct
    } = req.body;

    if (!name) {
      return err(res, 'Property name is required');
    }

    let mgr = manager_id || null;

    if (!mgr && req.user.role === 'property_manager') {
      mgr = req.user.sub;
    }

    // Manager must belong to the same organisation.
    if (mgr) {
      const [[m]] = await pool.query(
        'SELECT id FROM users WHERE id=? AND org_id=?',
        [mgr, req.user.org_id]
      );

      if (!m) {
        return err(
          res,
          'Manager not found in your organisation',
          404
        );
      }
    }

    // Owner must belong to the same organisation.
    if (owner_id) {
      const [[o]] = await pool.query(
        'SELECT id FROM users WHERE id=? AND org_id=?',
        [owner_id, req.user.org_id]
      );

      if (!o) {
        return err(
          res,
          'Owner not found in your organisation',
          404
        );
      }
    }

    const [r] = await pool.query(
      `
      INSERT INTO properties
        (
          name,
          location,
          address,
          description,
          manager_id,
          owner_id,
          management_fee_pct,
          org_id
        )
      VALUES (?,?,?,?,?,?,?,?)
      `,
      [
        name,
        location || null,
        address || null,
        description || null,
        mgr,
        owner_id || null,
        management_fee_pct || 0,
        req.user.org_id
      ]
    );

    // Assign property to manager if they don't already have one.
    if (mgr) {
      await pool.query(
        `
        UPDATE users
        SET property_id=?
        WHERE id=?
          AND org_id=?
          AND property_id IS NULL
        `,
        [r.insertId, mgr, req.user.org_id]
      );
    }

    ok(
      res,
      {
        id: r.insertId,
        message: 'Property created'
      },
      201
    );
  } catch (e) {
    safeErr(res, e);
  }
};


exports.update = async (req, res) => {
  try {
    const {
      name,
      location,
      address,
      description,
      manager_id,
      owner_id,
      management_fee_pct
    } = req.body;

    // Confirm property belongs to current organisation.
    const [[old]] = await pool.query(
      `
      SELECT manager_id, id
      FROM properties
      WHERE id=?
        AND org_id=?
      `,
      [req.params.id, req.user.org_id]
    );

    if (!old) {
      return err(res, 'Property not found', 404);
    }

    // Validate new manager belongs to same organisation.
    if (manager_id) {
      const [[m]] = await pool.query(
        `
        SELECT id
        FROM users
        WHERE id=?
          AND org_id=?
        `,
        [manager_id, req.user.org_id]
      );

      if (!m) {
        return err(
          res,
          'Manager not found in your organisation',
          404
        );
      }
    }

    // Validate owner belongs to same organisation.
    if (owner_id) {
      const [[o]] = await pool.query(
        `
        SELECT id
        FROM users
        WHERE id=?
          AND org_id=?
        `,
        [owner_id, req.user.org_id]
      );

      if (!o) {
        return err(
          res,
          'Owner not found in your organisation',
          404
        );
      }
    }

    await pool.query(
      `
      UPDATE properties
      SET
        name=?,
        location=?,
        address=?,
        description=?,
        manager_id=?,
        owner_id=?,
        management_fee_pct=?
      WHERE id=?
        AND org_id=?
      `,
      [
        name,
        location || null,
        address || null,
        description || null,
        manager_id || null,
        owner_id || null,
        management_fee_pct || 0,
        req.params.id,
        req.user.org_id
      ]
    );

    // If manager changed, update property assignments.
    if (String(old.manager_id) !== String(manager_id)) {
      if (old.manager_id) {
        await pool.query(
          `
          UPDATE users
          SET property_id=NULL
          WHERE id=?
            AND org_id=?
            AND property_id=?
          `,
          [
            old.manager_id,
            req.user.org_id,
            req.params.id
          ]
        );
      }

      if (manager_id) {
        await pool.query(
          `
          UPDATE users
          SET property_id=?
          WHERE id=?
            AND org_id=?
          `,
          [
            req.params.id,
            manager_id,
            req.user.org_id
          ]
        );
      }
    }

    ok(res, {
      message: 'Property updated'
    });
  } catch (e) {
    safeErr(res, e);
  }
};


exports.getOne = async (req, res) => {
  try {
    const [[p]] = await pool.query(
      `
      SELECT
        p.*,

        u.full_name AS manager_name,
        u.phone AS manager_phone,
        u.email AS manager_email,

        o.full_name AS owner_name,

        COUNT(DISTINCT un.id) AS total_units,

        COUNT(
          DISTINCT CASE
            WHEN un.status='occupied' THEN un.id
          END
        ) AS occupied_units,

        COUNT(
          DISTINCT CASE
            WHEN un.status='vacant' THEN un.id
          END
        ) AS vacant_units,

        COALESCE(
          (
            SELECT SUM(un2.rent_amount)
            FROM units un2
            WHERE un2.property_id=p.id
          ),
          0
        ) AS potential_monthly_revenue

      FROM properties p

      LEFT JOIN users u
        ON p.manager_id=u.id
       AND u.org_id=p.org_id

      LEFT JOIN users o
        ON p.owner_id=o.id
       AND o.org_id=p.org_id

      LEFT JOIN units un
        ON p.id=un.property_id

      WHERE p.id=?
        AND p.org_id=?

      GROUP BY p.id
      `,
      [req.params.id, req.user.org_id]
    );

    if (!p) {
      return err(res, 'Property not found', 404);
    }

    // Staff assigned to this property.
    // Keep organisation isolation here as well.
    const [staff] = await pool.query(
      `
      SELECT
        id,
        full_name,
        email,
        phone,
        role,
        profile_photo,
        is_active,
        last_login
      FROM users
      WHERE property_id=?
        AND org_id=?
        AND role IN (
          'caretaker',
          'security',
          'property_manager'
        )
      ORDER BY role,full_name
      `,
      [
        req.params.id,
        req.user.org_id
      ]
    );

    // Units belonging to this organisation's property.
    const [units] = await pool.query(
      `
      SELECT un.*
      FROM units un
      INNER JOIN properties p
        ON p.id=un.property_id
       AND p.org_id=?
      WHERE un.property_id=?
      ORDER BY un.floor,un.unit_number
      `,
      [
        req.user.org_id,
        req.params.id
      ]
    );

    ok(res, {
      property: {
        ...p,
        staff
      },
      units
    });
  } catch (e) {
    safeErr(res, e);
  }
};


exports.delete = async (req, res) => {
  try {
    const [[p]] = await pool.query(
      `
      SELECT id
      FROM properties
      WHERE id=?
        AND org_id=?
      `,
      [
        req.params.id,
        req.user.org_id
      ]
    );

    if (!p) {
      return err(res, 'Property not found', 404);
    }

    // Don't allow deletion while active tenancies exist.
    const [[{ active }]] = await pool.query(
      `
      SELECT COUNT(*) AS active
      FROM tenancies ten
      JOIN units u
        ON ten.unit_id=u.id
      JOIN properties p
        ON p.id=u.property_id
      WHERE u.property_id=?
        AND p.org_id=?
        AND ten.status IN ('active','approved')
      `,
      [
        req.params.id,
        req.user.org_id
      ]
    );

    if (active > 0) {
      return err(
        res,
        `Cannot delete: this property has ${active} active tenancy${active > 1 ? 's' : ''}. Terminate all tenancies first.`,
        409
      );
    }

    await pool.query(
      `
      DELETE FROM properties
      WHERE id=?
        AND org_id=?
      `,
      [
        req.params.id,
        req.user.org_id
      ]
    );

    ok(res, {
      message: 'Property deleted'
    });
  } catch (e) {
    safeErr(res, e);
  }
};
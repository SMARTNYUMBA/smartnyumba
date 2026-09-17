const pool = require('../../config/db');
const { ok, err, safeErr } = require('../../utils/helpers');

exports.submit = async (req, res) => {
  try {
    const { request_id, rating, comment } = req.body;
    if (!request_id || !rating) return err(res, 'request_id and rating required');
    if (rating < 1 || rating > 5) return err(res, 'Rating must be 1-5');

    // Verify tenant owns this request
    // FIX: also fetch t.id — the INSERT below was writing req.user.sub
    // (a users.id) into maintenance_ratings.tenant_id, which is supposed
    // to hold a tenants.id. getStats()'s "recent ratings" query does
    // `JOIN tenants t ON r.tenant_id=t.id`, an INNER JOIN, so with the
    // wrong id every submitted rating was silently dropped from that
    // list (or, worse, could coincidentally match an unrelated tenant).
    const [[mr]] = await pool.query(`
      SELECT mr.id, t.id AS tenant_id FROM maintenance_requests mr
      JOIN tenancies ten ON mr.tenancy_id=ten.id
      JOIN tenants t ON ten.tenant_id=t.id
      WHERE mr.id=? AND t.user_id=? AND mr.status='completed'`, [request_id, req.user.sub]);
    if (!mr) return err(res, 'Request not found or not yet completed', 404);

    await pool.query(
      'INSERT INTO maintenance_ratings (request_id,tenant_id,rating,comment) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE rating=?,comment=?',
      [request_id, mr.tenant_id, rating, comment||null, rating, comment||null]);

    ok(res, { message: 'Rating submitted. Thank you for your feedback!' });
  } catch(e) { safeErr(res, e); }
};

exports.getStats = async (req, res) => {
  try {
    // SECURITY FIX: no org check at all — a property_manager calling
    // this with no ?property_id saw maintenance ratings and tenant
    // comments across every organisation on the platform. Also switched
    // the property_id filter to a bound parameter instead of splicing
    // parseInt() straight into the query string.
    const params = [req.user.org_id];
    let propFilter = '';
    if (req.query.property_id) { propFilter = 'AND p.id=?'; params.push(req.query.property_id); }
    const [[stats]] = await pool.query(`
      SELECT AVG(r.rating) AS avg_rating, COUNT(r.id) AS total_ratings,
        SUM(r.rating=5) AS five_star, SUM(r.rating=4) AS four_star,
        SUM(r.rating=3) AS three_star, SUM(r.rating<=2) AS low_rated
      FROM maintenance_ratings r
      JOIN maintenance_requests mr ON r.request_id=mr.id
      JOIN properties p ON mr.property_id=p.id
      WHERE p.org_id=? ${propFilter}`, params);
    const [recent] = await pool.query(`
      SELECT r.*,mr.title,u.full_name AS tenant_name,p.name AS property_name
      FROM maintenance_ratings r JOIN maintenance_requests mr ON r.request_id=mr.id
      JOIN tenants t ON r.tenant_id=t.id JOIN users u ON t.user_id=u.id
      JOIN properties p ON mr.property_id=p.id
      WHERE p.org_id=? ${propFilter}
      ORDER BY r.created_at DESC LIMIT 10`, params);
    ok(res, { stats, recent_ratings: recent });
  } catch(e) { safeErr(res, e); }
};

const { Pool } = require('pg');
const fs = require('fs');

let pool = null;
let enabled = false;

async function initDb(databaseUrl) {
  if (!databaseUrl) return false;
  // Configure timeouts and SSL; do not mark enabled until we verify connectivity
  try {
    const sslDisabled = (process.env.PGSSLMODE === 'disable' || process.env.PGSSLMODE === 'no-ssl');
    const sslRejectUnauthorized = process.env.PG_SSL_REJECT_UNAUTHORIZED !== 'false';
    const sslOption = sslDisabled ? false : { rejectUnauthorized: sslRejectUnauthorized };
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: sslOption,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      max: 10
    });
  } catch (err) {
    console.error('Failed to create Postgres pool:', err && err.stack ? err.stack : err);
    pool = null;
    enabled = false;
    return false;
  }

  // Log any unexpected pool errors
  pool.on('error', (err) => {
    console.error('Postgres pool error:', err && err.stack ? err.stack : err);
  });

  // Try creating tables with a small retry loop for transient connection errors
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await createTables();
      enabled = true;
      return true;
    } catch (err) {
      console.error(`initDb: attempt ${attempt} failed:`, err && err.stack ? err.stack : err);
      if (attempt < maxAttempts) {
        const waitMs = 500 * attempt;
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      console.error('initDb: all attempts to initialize Postgres failed');
      try {
        // attempt graceful shutdown of pool
        if (pool && typeof pool.end === 'function') await pool.end();
      } catch (endErr) {
        console.error('Error closing Postgres pool after failed init:', endErr && endErr.stack ? endErr.stack : endErr);
      }
      pool = null;
      enabled = false;
      // don't throw — return false so caller can continue running without crashing
      return false;
    }
  }
}

async function createTables() {
  const sql = `
    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      service_id INTEGER,
      city_id INTEGER,
      customer_name TEXT,
      customer_email TEXT,
      customer_phone TEXT,
      street_name TEXT,
      house_number TEXT,
      property_size TEXT,
      doorbell_name TEXT,
      booking_date DATE,
      booking_time TEXT,
      hours INTEGER,
      cleaners INTEGER,
      total_amount NUMERIC,
      payment_intent_id TEXT,
      notes TEXT,
      additional_services JSONB,
      supplies JSONB,
      status TEXT,
      stripe_status TEXT,
      created_at TIMESTAMP,
      updated_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS services (
      id SERIAL PRIMARY KEY,
      name TEXT,
      name_it TEXT,
      name_ka TEXT,
      name_ru TEXT,
      description TEXT,
      description_it TEXT,
      description_ka TEXT,
      description_ru TEXT,
      price_per_hour NUMERIC,
      enabled BOOLEAN
    );

    CREATE TABLE IF NOT EXISTS cities (
      id SERIAL PRIMARY KEY,
      name TEXT,
      name_it TEXT,
      name_ka TEXT,
      name_ru TEXT,
      enabled BOOLEAN,
      working_days TEXT,
      working_hours_start TEXT,
      working_hours_end TEXT
    );

    CREATE TABLE IF NOT EXISTS workers (
      id SERIAL PRIMARY KEY,
      name TEXT,
      email TEXT,
      phone TEXT,
      specialties JSONB,
      rating NUMERIC,
      completed_jobs INTEGER,
      active BOOLEAN,
      created_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS blocked_slots (
      id SERIAL PRIMARY KEY,
      city_id INTEGER,
      blocked_date DATE,
      blocked_time TEXT,
      reason TEXT
    );

    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      username TEXT,
      password_hash TEXT
    );
  `;
  await pool.query(sql);
}

// Helper: insert a row into `table` using `client` (can be pool or client).
// `data` is an object mapping column -> value. Columns with undefined are omitted.
async function runInsert(client, table, data) {
  const cols = [];
  const params = [];
  for (const k of Object.keys(data)) {
    const v = data[k];
    if (v === undefined) continue; // omit
    cols.push(k);
    params.push(v);
  }
  if (cols.length === 0) return null;
  const placeholders = params.map((_, i) => `$${i+1}`);
  const sql = `INSERT INTO ${table}(${cols.join(',')}) VALUES(${placeholders.join(',')})`;
  return client.query(sql, params);
}

async function getBookings() {
  if (!enabled) return [];
  const res = await pool.query('SELECT * FROM bookings ORDER BY id');
  return res.rows.map(r => ({
    id: r.id,
    service_id: r.service_id,
    city_id: r.city_id,
    customer_name: r.customer_name,
    customer_email: r.customer_email,
    customer_phone: r.customer_phone,
    street_name: r.street_name,
    house_number: r.house_number,
    property_size: r.property_size,
    doorbell_name: r.doorbell_name,
    booking_date: r.booking_date ? r.booking_date.toISOString().slice(0,10) : null,
    booking_time: r.booking_time,
    hours: r.hours,
    cleaners: r.cleaners,
    total_amount: parseFloat(r.total_amount),
    payment_intent_id: r.payment_intent_id,
    notes: r.notes,
    additional_services: r.additional_services || [],
    supplies: r.supplies || [],
    status: r.status,
    stripe_status: r.stripe_status,
    created_at: r.created_at ? r.created_at.toISOString() : null,
    updated_at: r.updated_at ? r.updated_at.toISOString() : null
  }));
}

async function replaceBookings(bookings) {
  if (!enabled) return false;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE bookings');
    for (const b of bookings) {
      const data = {};
      if (b.id != null) data.id = b.id;
      data.service_id = b.service_id != null ? b.service_id : null;
      data.city_id = b.city_id != null ? b.city_id : null;
      data.customer_name = b.customer_name || null;
      data.customer_email = b.customer_email || null;
      data.customer_phone = b.customer_phone || null;
      data.street_name = b.street_name || null;
      data.house_number = b.house_number || null;
      data.property_size = b.property_size || null;
      data.doorbell_name = b.doorbell_name || null;
      data.booking_date = b.booking_date || null;
      data.booking_time = b.booking_time || null;
      data.hours = b.hours != null ? b.hours : null;
      data.cleaners = b.cleaners != null ? b.cleaners : null;
      data.total_amount = b.total_amount != null ? b.total_amount : null;
      data.payment_intent_id = b.payment_intent_id || null;
      data.notes = b.notes || null;
      data.additional_services = JSON.stringify(b.additional_services || []);
      data.supplies = JSON.stringify(b.supplies || []);
      data.status = b.status || null;
      data.stripe_status = b.stripe_status || null;
      data.created_at = b.created_at || null;
      data.updated_at = b.updated_at || null;
      await runInsert(client, 'bookings', data);
    }
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('replaceBookings error:', err && err.message ? err.message : err);
    return false;
  } finally {
    client.release();
  }
}

async function insertBooking(b) {
  if (!enabled) return false;
  try {
    const data = {};
    if (b.id != null) data.id = b.id;
    data.service_id = b.service_id != null ? b.service_id : null;
    data.city_id = b.city_id != null ? b.city_id : null;
    data.customer_name = b.customer_name || null;
    data.customer_email = b.customer_email || null;
    data.customer_phone = b.customer_phone || null;
    data.street_name = b.street_name || null;
    data.house_number = b.house_number || null;
    data.property_size = b.property_size || null;
    data.doorbell_name = b.doorbell_name || null;
    data.booking_date = b.booking_date || null;
    data.booking_time = b.booking_time || null;
    data.hours = b.hours != null ? b.hours : null;
    data.cleaners = b.cleaners != null ? b.cleaners : null;
    data.total_amount = b.total_amount != null ? b.total_amount : null;
    data.payment_intent_id = b.payment_intent_id || null;
    data.notes = b.notes || null;
    data.additional_services = JSON.stringify(b.additional_services || []);
    data.supplies = JSON.stringify(b.supplies || []);
    data.status = b.status || null;
    data.stripe_status = b.stripe_status || null;
    data.created_at = b.created_at || null;
    data.updated_at = b.updated_at || null;
    await runInsert(pool, 'bookings', data);
    return true;
  } catch (err) {
    console.error('insertBooking error:', err && err.message ? err.message : err);
    return false;
  }
}

async function updateBookingById(id, fields) {
  if (!enabled) return false;
  const sets = [];
  const params = [];
  let i = 1;
  for (const k of Object.keys(fields)) {
    sets.push(`${k} = $${i}`);
    params.push(fields[k]);
    i++;
  }
  if (sets.length === 0) return false;
  params.push(id);
  const sql = `UPDATE bookings SET ${sets.join(', ')} WHERE id = $${i}`;
  try {
    await pool.query(sql, params);
    return true;
  } catch (err) {
    console.error('updateBookingById error:', err && err.message ? err.message : err);
    return false;
  }
}

async function deleteBookingById(id) {
  if (!enabled) return false;
  try {
    await pool.query('DELETE FROM bookings WHERE id = $1', [id]);
    return true;
  } catch (err) {
    console.error('deleteBookingById error:', err && err.message ? err.message : err);
    return false;
  }
}

async function clearBookings() {
  if (!enabled) return false;
  try {
    await pool.query('TRUNCATE bookings');
    return true;
  } catch (err) {
    console.error('clearBookings error:', err && err.message ? err.message : err);
    return false;
  }
}

// Services functions
async function getServices() {
  if (!enabled) return [];
  const res = await pool.query('SELECT * FROM services ORDER BY id');
  return res.rows.map(r => ({
    id: r.id,
    name: r.name,
    name_it: r.name_it,
    name_ka: r.name_ka,
    name_ru: r.name_ru,
    description: r.description,
    description_it: r.description_it,
    description_ka: r.description_ka,
    description_ru: r.description_ru,
    price_per_hour: parseFloat(r.price_per_hour),
    enabled: r.enabled
  }));
}

async function replaceServices(services) {
  if (!enabled) return false;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE services');
    for (const s of services) {
      const data = {};
      if (s.id != null) data.id = s.id;
      data.name = s.name || null;
      data.name_it = s.name_it || null;
      data.name_ka = s.name_ka || null;
      data.name_ru = s.name_ru || null;
      data.description = s.description || null;
      data.description_it = s.description_it || null;
      data.description_ka = s.description_ka || null;
      data.description_ru = s.description_ru || null;
      data.price_per_hour = s.price_per_hour != null ? s.price_per_hour : null;
      data.enabled = s.enabled !== undefined ? s.enabled : true;
      await runInsert(client, 'services', data);
    }
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('replaceServices error:', err && err.message ? err.message : err);
    return false;
  } finally {
    client.release();
  }
}

async function insertService(s) {
  if (!enabled) return false;
  try {
    const data = {};
    if (s.id != null) data.id = s.id;
    data.name = s.name || null;
    data.name_it = s.name_it || null;
    data.name_ka = s.name_ka || null;
    data.name_ru = s.name_ru || null;
    data.description = s.description || null;
    data.description_it = s.description_it || null;
    data.description_ka = s.description_ka || null;
    data.description_ru = s.description_ru || null;
    data.price_per_hour = s.price_per_hour != null ? s.price_per_hour : null;
    data.enabled = s.enabled !== undefined ? s.enabled : true;
    await runInsert(pool, 'services', data);
    return true;
  } catch (err) {
    console.error('insertService error:', err && err.message ? err.message : err);
    return false;
  }
}

async function updateServiceById(id, fields) {
  if (!enabled) return false;
  const sets = [];
  const params = [];
  let i = 1;
  for (const k of Object.keys(fields)) {
    sets.push(`${k} = $${i}`);
    params.push(fields[k]);
    i++;
  }
  if (sets.length === 0) return false;
  params.push(id);
  const sql = `UPDATE services SET ${sets.join(', ')} WHERE id = $${i}`;
  try {
    await pool.query(sql, params);
    return true;
  } catch (err) {
    console.error('updateServiceById error:', err && err.message ? err.message : err);
    return false;
  }
}

async function deleteServiceById(id) {
  if (!enabled) return false;
  try {
    await pool.query('DELETE FROM services WHERE id = $1', [id]);
    return true;
  } catch (err) {
    console.error('deleteServiceById error:', err && err.message ? err.message : err);
    return false;
  }
}

// Cities functions
async function getCities() {
  if (!enabled) return [];
  const res = await pool.query('SELECT * FROM cities ORDER BY id');
  return res.rows.map(r => ({
    id: r.id,
    name: r.name,
    name_it: r.name_it,
    name_ka: r.name_ka,
    name_ru: r.name_ru,
    enabled: r.enabled,
    working_days: r.working_days,
    working_hours_start: r.working_hours_start,
    working_hours_end: r.working_hours_end
  }));
}

async function replaceCities(cities) {
  if (!enabled) return false;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE cities');
    for (const c of cities) {
      const data = {};
      if (c.id != null) data.id = c.id;
      data.name = c.name || null;
      data.name_it = c.name_it || null;
      data.name_ka = c.name_ka || null;
      data.name_ru = c.name_ru || null;
      data.enabled = c.enabled !== undefined ? c.enabled : true;
      data.working_days = c.working_days || null;
      data.working_hours_start = c.working_hours_start || null;
      data.working_hours_end = c.working_hours_end || null;
      await runInsert(client, 'cities', data);
    }
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('replaceCities error:', err && err.message ? err.message : err);
    return false;
  } finally {
    client.release();
  }
}

async function insertCity(c) {
  if (!enabled) return false;
  try {
    const data = {};
    if (c.id != null) data.id = c.id;
    data.name = c.name || null;
    data.name_it = c.name_it || null;
    data.name_ka = c.name_ka || null;
    data.name_ru = c.name_ru || null;
    data.enabled = c.enabled !== undefined ? c.enabled : true;
    data.working_days = c.working_days || null;
    data.working_hours_start = c.working_hours_start || null;
    data.working_hours_end = c.working_hours_end || null;
    await runInsert(pool, 'cities', data);
    return true;
  } catch (err) {
    console.error('insertCity error:', err && err.message ? err.message : err);
    return false;
  }
}

async function updateCityById(id, fields) {
  if (!enabled) return false;
  const sets = [];
  const params = [];
  let i = 1;
  for (const k of Object.keys(fields)) {
    sets.push(`${k} = $${i}`);
    params.push(fields[k]);
    i++;
  }
  if (sets.length === 0) return false;
  params.push(id);
  const sql = `UPDATE cities SET ${sets.join(', ')} WHERE id = $${i}`;
  try {
    await pool.query(sql, params);
    return true;
  } catch (err) {
    console.error('updateCityById error:', err && err.message ? err.message : err);
    return false;
  }
}

async function deleteCityById(id) {
  if (!enabled) return false;
  try {
    await pool.query('DELETE FROM cities WHERE id = $1', [id]);
    return true;
  } catch (err) {
    console.error('deleteCityById error:', err && err.message ? err.message : err);
    return false;
  }
}

// Workers functions
async function getWorkers() {
  if (!enabled) return [];
  const res = await pool.query('SELECT * FROM workers ORDER BY id');
  return res.rows.map(r => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    specialties: r.specialties || [],
    rating: parseFloat(r.rating),
    completed_jobs: r.completed_jobs,
    active: r.active,
    created_at: r.created_at ? r.created_at.toISOString() : null
  }));
}

async function replaceWorkers(workers) {
  if (!enabled) return false;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE workers');
    for (const w of workers) {
      const data = {};
      if (w.id != null) data.id = w.id;
      data.name = w.name || null;
      data.email = w.email || null;
      data.phone = w.phone || null;
      data.specialties = JSON.stringify(w.specialties || []);
      data.rating = w.rating != null ? w.rating : null;
      data.completed_jobs = w.completed_jobs != null ? w.completed_jobs : null;
      data.active = w.active !== undefined ? w.active : true;
      data.created_at = w.created_at || null;
      await runInsert(client, 'workers', data);
    }
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('replaceWorkers error:', err && err.message ? err.message : err);
    return false;
  } finally {
    client.release();
  }
}

async function insertWorker(w) {
  if (!enabled) return false;
  try {
    const data = {};
    if (w.id != null) data.id = w.id;
    data.name = w.name || null;
    data.email = w.email || null;
    data.phone = w.phone || null;
    data.specialties = JSON.stringify(w.specialties || []);
    data.rating = w.rating != null ? w.rating : null;
    data.completed_jobs = w.completed_jobs != null ? w.completed_jobs : null;
    data.active = w.active !== undefined ? w.active : true;
    data.created_at = w.created_at || null;
    await runInsert(pool, 'workers', data);
    return true;
  } catch (err) {
    console.error('insertWorker error:', err && err.message ? err.message : err);
    return false;
  }
}

async function updateWorkerById(id, fields) {
  if (!enabled) return false;
  const sets = [];
  const params = [];
  let i = 1;
  for (const k of Object.keys(fields)) {
    sets.push(`${k} = $${i}`);
    params.push(fields[k]);
    i++;
  }
  if (sets.length === 0) return false;
  params.push(id);
  const sql = `UPDATE workers SET ${sets.join(', ')} WHERE id = $${i}`;
  try {
    await pool.query(sql, params);
    return true;
  } catch (err) {
    console.error('updateWorkerById error:', err && err.message ? err.message : err);
    return false;
  }
}

async function deleteWorkerById(id) {
  if (!enabled) return false;
  try {
    await pool.query('DELETE FROM workers WHERE id = $1', [id]);
    return true;
  } catch (err) {
    console.error('deleteWorkerById error:', err && err.message ? err.message : err);
    return false;
  }
}

// Blocked slots functions
async function getBlockedSlots() {
  if (!enabled) return [];
  const res = await pool.query('SELECT * FROM blocked_slots ORDER BY id');
  return res.rows.map(r => ({
    id: r.id,
    city_id: r.city_id,
    blocked_date: r.blocked_date ? r.blocked_date.toISOString().slice(0,10) : null,
    blocked_time: r.blocked_time,
    reason: r.reason
  }));
}

async function replaceBlockedSlots(slots) {
  if (!enabled) return false;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE blocked_slots');
    for (const s of slots) {
      const data = {};
      if (s.id != null) data.id = s.id;
      data.city_id = s.city_id != null ? s.city_id : null;
      data.blocked_date = s.blocked_date || null;
      data.blocked_time = s.blocked_time || null;
      data.reason = s.reason || null;
      await runInsert(client, 'blocked_slots', data);
    }
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('replaceBlockedSlots error:', err && err.message ? err.message : err);
    return false;
  } finally {
    client.release();
  }
}

async function insertBlockedSlot(s) {
  if (!enabled) return false;
  try {
    const data = {};
    if (s.id != null) data.id = s.id;
    data.city_id = s.city_id != null ? s.city_id : null;
    data.blocked_date = s.blocked_date || null;
    data.blocked_time = s.blocked_time || null;
    data.reason = s.reason || null;
    await runInsert(pool, 'blocked_slots', data);
    return true;
  } catch (err) {
    console.error('insertBlockedSlot error:', err && err.message ? err.message : err);
    return false;
  }
}

async function deleteBlockedSlotById(id) {
  if (!enabled) return false;
  try {
    await pool.query('DELETE FROM blocked_slots WHERE id = $1', [id]);
    return true;
  } catch (err) {
    console.error('deleteBlockedSlotById error:', err && err.message ? err.message : err);
    return false;
  }
}

// Admins functions
async function getAdmins() {
  if (!enabled) return [];
  const res = await pool.query('SELECT * FROM admins ORDER BY id');
  return res.rows.map(r => ({
    id: r.id,
    username: r.username,
    password_hash: r.password_hash
  }));
}

async function replaceAdmins(admins) {
  if (!enabled) return false;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE admins');
    for (const a of admins) {
      const data = {};
      if (a.id != null) data.id = a.id;
      data.username = a.username || null;
      data.password_hash = a.password_hash || null;
      await runInsert(client, 'admins', data);
    }
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('replaceAdmins error:', err && err.message ? err.message : err);
    return false;
  } finally {
    client.release();
  }
}

async function insertAdmin(a) {
  if (!enabled) return false;
  try {
    const data = {};
    if (a.id != null) data.id = a.id;
    data.username = a.username || null;
    data.password_hash = a.password_hash || null;
    await runInsert(pool, 'admins', data);
    return true;
  } catch (err) {
    console.error('insertAdmin error:', err && err.message ? err.message : err);
    return false;
  }
}

async function updateAdminById(id, fields) {
  if (!enabled) return false;
  const sets = [];
  const params = [];
  let i = 1;
  for (const k of Object.keys(fields)) {
    sets.push(`${k} = $${i}`);
    params.push(fields[k]);
    i++;
  }
  if (sets.length === 0) return false;
  params.push(id);
  const sql = `UPDATE admins SET ${sets.join(', ')} WHERE id = $${i}`;
  try {
    await pool.query(sql, params);
    return true;
  } catch (err) {
    console.error('updateAdminById error:', err && err.message ? err.message : err);
    return false;
  }
}

async function deleteAdminById(id) {
  if (!enabled) return false;
  try {
    await pool.query('DELETE FROM admins WHERE id = $1', [id]);
    return true;
  } catch (err) {
    console.error('deleteAdminById error:', err && err.message ? err.message : err);
    return false;
  }
}

module.exports = {
  initDb,
  getBookings, replaceBookings, insertBooking, updateBookingById, deleteBookingById, clearBookings,
  getServices, replaceServices, insertService, updateServiceById, deleteServiceById,
  getCities, replaceCities, insertCity, updateCityById, deleteCityById,
  getWorkers, replaceWorkers, insertWorker, updateWorkerById, deleteWorkerById,
  getBlockedSlots, replaceBlockedSlots, insertBlockedSlot, deleteBlockedSlotById,
  getAdmins, replaceAdmins, insertAdmin, updateAdminById, deleteAdminById,
  enabled: () => enabled
};

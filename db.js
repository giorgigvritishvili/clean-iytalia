const { Pool } = require('pg');
const fs = require('fs');

let pool = null;
let enabled = false;

async function initDb(databaseUrl) {
  if (!databaseUrl) return false;
  pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  enabled = true;
  await createTables();
  return true;
}

async function createTables() {
  const sql = `
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY,
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
      id INTEGER PRIMARY KEY,
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
      id INTEGER PRIMARY KEY,
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
      id INTEGER PRIMARY KEY,
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
      id INTEGER PRIMARY KEY,
      city_id INTEGER,
      blocked_date DATE,
      blocked_time TEXT,
      reason TEXT
    );

    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY,
      username TEXT,
      password_hash TEXT
    );
  `;
  await pool.query(sql);
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
      const query = `INSERT INTO bookings(
        id, service_id, city_id, customer_name, customer_email, customer_phone,
        street_name, house_number, property_size, doorbell_name, booking_date, booking_time,
        hours, cleaners, total_amount, payment_intent_id, notes, additional_services, supplies,
        status, stripe_status, created_at, updated_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`;
      const params = [
        b.id || null,
        b.service_id || null,
        b.city_id || null,
        b.customer_name || null,
        b.customer_email || null,
        b.customer_phone || null,
        b.street_name || null,
        b.house_number || null,
        b.property_size || null,
        b.doorbell_name || null,
        b.booking_date || null,
        b.booking_time || null,
        b.hours || null,
        b.cleaners || null,
        b.total_amount || null,
        b.payment_intent_id || null,
        b.notes || null,
        JSON.stringify(b.additional_services || []),
        JSON.stringify(b.supplies || []),
        b.status || null,
        b.stripe_status || null,
        b.created_at || null,
        b.updated_at || null
      ];
      await client.query(query, params);
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
  const query = `INSERT INTO bookings(
    id, service_id, city_id, customer_name, customer_email, customer_phone,
    street_name, house_number, property_size, doorbell_name, booking_date, booking_time,
    hours, cleaners, total_amount, payment_intent_id, notes, additional_services, supplies,
    status, stripe_status, created_at, updated_at
  ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`;
  const params = [
    b.id || null,
    b.service_id || null,
    b.city_id || null,
    b.customer_name || null,
    b.customer_email || null,
    b.customer_phone || null,
    b.street_name || null,
    b.house_number || null,
    b.property_size || null,
    b.doorbell_name || null,
    b.booking_date || null,
    b.booking_time || null,
    b.hours || null,
    b.cleaners || null,
    b.total_amount || null,
    b.payment_intent_id || null,
    b.notes || null,
    JSON.stringify(b.additional_services || []),
    JSON.stringify(b.supplies || []),
    b.status || null,
    b.stripe_status || null,
    b.created_at || null,
    b.updated_at || null
  ];
  try {
    await pool.query(query, params);
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
      const query = `INSERT INTO services(
        id, name, name_it, name_ka, name_ru, description, description_it, description_ka, description_ru, price_per_hour, enabled
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`;
      const params = [
        s.id || null,
        s.name || null,
        s.name_it || null,
        s.name_ka || null,
        s.name_ru || null,
        s.description || null,
        s.description_it || null,
        s.description_ka || null,
        s.description_ru || null,
        s.price_per_hour || null,
        s.enabled !== undefined ? s.enabled : true
      ];
      await client.query(query, params);
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
  const query = `INSERT INTO services(
    id, name, name_it, name_ka, name_ru, description, description_it, description_ka, description_ru, price_per_hour, enabled
  ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`;
  const params = [
    s.id || null,
    s.name || null,
    s.name_it || null,
    s.name_ka || null,
    s.name_ru || null,
    s.description || null,
    s.description_it || null,
    s.description_ka || null,
    s.description_ru || null,
    s.price_per_hour || null,
    s.enabled !== undefined ? s.enabled : true
  ];
  try {
    await pool.query(query, params);
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
      const query = `INSERT INTO cities(
        id, name, name_it, name_ka, name_ru, enabled, working_days, working_hours_start, working_hours_end
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`;
      const params = [
        c.id || null,
        c.name || null,
        c.name_it || null,
        c.name_ka || null,
        c.name_ru || null,
        c.enabled !== undefined ? c.enabled : true,
        c.working_days || null,
        c.working_hours_start || null,
        c.working_hours_end || null
      ];
      await client.query(query, params);
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
  const query = `INSERT INTO cities(
    id, name, name_it, name_ka, name_ru, enabled, working_days, working_hours_start, working_hours_end
  ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`;
  const params = [
    c.id || null,
    c.name || null,
    c.name_it || null,
    c.name_ka || null,
    c.name_ru || null,
    c.enabled !== undefined ? c.enabled : true,
    c.working_days || null,
    c.working_hours_start || null,
    c.working_hours_end || null
  ];
  try {
    await pool.query(query, params);
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
      const query = `INSERT INTO workers(
        id, name, email, phone, specialties, rating, completed_jobs, active, created_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`;
      const params = [
        w.id || null,
        w.name || null,
        w.email || null,
        w.phone || null,
        JSON.stringify(w.specialties || []),
        w.rating || null,
        w.completed_jobs || null,
        w.active !== undefined ? w.active : true,
        w.created_at || null
      ];
      await client.query(query, params);
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
  const query = `INSERT INTO workers(
    id, name, email, phone, specialties, rating, completed_jobs, active, created_at
  ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`;
  const params = [
    w.id || null,
    w.name || null,
    w.email || null,
    w.phone || null,
    JSON.stringify(w.specialties || []),
    w.rating || null,
    w.completed_jobs || null,
    w.active !== undefined ? w.active : true,
    w.created_at || null
  ];
  try {
    await pool.query(query, params);
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
      const query = `INSERT INTO blocked_slots(
        id, city_id, blocked_date, blocked_time, reason
      ) VALUES($1,$2,$3,$4,$5)`;
      const params = [
        s.id || null,
        s.city_id || null,
        s.blocked_date || null,
        s.blocked_time || null,
        s.reason || null
      ];
      await client.query(query, params);
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
  const query = `INSERT INTO blocked_slots(
    id, city_id, blocked_date, blocked_time, reason
  ) VALUES($1,$2,$3,$4,$5)`;
  const params = [
    s.id || null,
    s.city_id || null,
    s.blocked_date || null,
    s.blocked_time || null,
    s.reason || null
  ];
  try {
    await pool.query(query, params);
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
      const query = `INSERT INTO admins(
        id, username, password_hash
      ) VALUES($1,$2,$3)`;
      const params = [
        a.id || null,
        a.username || null,
        a.password_hash || null
      ];
      await client.query(query, params);
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
  const query = `INSERT INTO admins(
    id, username, password_hash
  ) VALUES($1,$2,$3)`;
  const params = [
    a.id || null,
    a.username || null,
    a.password_hash || null
  ];
  try {
    await pool.query(query, params);
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

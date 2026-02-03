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

module.exports = { initDb, getBookings, replaceBookings, insertBooking, updateBookingById, deleteBookingById, clearBookings, enabled: () => enabled };

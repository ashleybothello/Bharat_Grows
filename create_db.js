const { Client } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. This script will not run with a hardcoded credential.');
  process.exit(1);
}

const client = new Client({ connectionString });

async function run() {
  try {
    await client.connect();
    await client.query('CREATE DATABASE soil_ml_db;');
    console.log('Database soil_ml_db created successfully.');
  } catch (e) {
    if (e.code === '42P04') {
      console.log('Database already exists.');
    } else {
      console.error(e.message);
    }
  } finally {
    await client.end();
  }
}
run();

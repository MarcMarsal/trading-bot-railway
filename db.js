import sqlite3 from "sqlite3";
sqlite3.verbose();

const db = new sqlite3.Database("./database.db");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS candles (
      symbol TEXT,
      interval TEXT,
      timestamp INTEGER,
      open REAL,
      high REAL,
      low REAL,
      close REAL,
      volume REAL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS signals (
      timestamp INTEGER,
      symbol TEXT,
      interval TEXT,
      type TEXT,
      entry REAL,
      tp REAL,
      sl REAL
    )
  `);
});

export default db;

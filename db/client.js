const { Client } = require("pg");

// Railway exposa la connexió a través de DATABASE_URL
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

client.connect()
  .then(() => console.log("PostgreSQL connectat"))
  .catch(err => console.error("Error connectant PostgreSQL:", err.message));

module.exports = { client };

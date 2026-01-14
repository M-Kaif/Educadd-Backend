import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { v4 as uuid } from "uuid";
import dotenv from "dotenv";
import pkg from "pg";
import { sendLeadEmail } from "./email.js";

dotenv.config();

const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 5000;

const DATABASE_URL = process.env.DATABASE_URL;
let pool = null;

async function initDb() {
  if (!DATABASE_URL) return;
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false,
  });

  // Ensure table exists (id generated in Node to avoid extension requirements)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leads (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      course TEXT,
      source TEXT DEFAULT 'website',
      created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT leads_email_phone_unique UNIQUE (email, phone)
    );
  `);
}

initDb()
  .then(() => {
    if (pool) console.log("Connected to PostgreSQL");
  })
  .catch((err) => {
    console.error("DB init error:", err);
  });

// Common disposable domains (small list; extend as needed)
const DISPOSABLE_DOMAINS = [
  "mailinator.com",
  "yopmail.com",
  "10minutemail.com",
  "maildrop.cc",
  "tempmail.com",
  "guerrillamail.com",
];

function isDisposableEmail(email) {
  const domain = (email || "").split("@")[1];
  return domain && DISPOSABLE_DOMAINS.includes(domain.toLowerCase());
}

function isAllSameDigits(phone) {
  return /^(\d)\1{9}$/.test(phone);
}

function isSequential(phone) {
  const seqs = ["0123456789", "1234567890", "0987654321"];
  return seqs.includes(phone);
}

function validatePhoneRaw(phoneRaw) {
  // Normalize digits
  const digits = (phoneRaw || "").replace(/\D/g, "");

  // If user provided country code 91 + 10 digits, ask them to enter without country code
  if (digits.length === 12 && digits.startsWith("91")) {
    return {
      ok: false,
      message:
        "Please enter your 10-digit phone number without country code (+91 or 91 at the start).",
    };
  }

  if (digits.length !== 10) {
    return { ok: false, message: "Phone number must be 10 digits (India)." };
  }

  if (!/^\d{10}$/.test(digits)) {
    return { ok: false, message: "Invalid phone number format." };
  }

  if (isAllSameDigits(digits) || isSequential(digits)) {
    return {
      ok: false,
      message:
        "Please provide a valid mobile number (not placeholders or sequential digits).",
    };
  }

  return { ok: true, phone: digits };
}

/**
 * Create Lead
 */
app.post("/leads", async (req, res) => {
  const { name, email, phone, course } = req.body;

  if (!name || !email || !phone) {
    return res
      .status(400)
      .json({ message: "Name, email and phone are required." });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: "Invalid email format." });
  }

  if (isDisposableEmail(email)) {
    return res.status(400).json({
      message:
        "Please use a permanent email address (no temporary/disposable addresses).",
    });
  }

  const phoneCheck = validatePhoneRaw(phone);
  if (!phoneCheck.ok) {
    return res.status(400).json({ message: phoneCheck.message });
  }

  const cleanedPhone = phoneCheck.phone;

  // If using DB, insert there; otherwise fallback to in-memory
  if (pool) {
    try {
      const id = uuid();
      const insertSQL = `
        INSERT INTO leads (id, name, email, phone, course, source)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (email, phone) DO NOTHING
        RETURNING id, name, email, phone, course, source, created_at_utc;
      `;

      const result = await pool.query(insertSQL, [
        id,
        name.trim(),
        email.trim().toLowerCase(),
        cleanedPhone,
        course || "",
        "website",
      ]);

      if (result.rowCount === 0) {
        return res.status(409).json({
          message:
            "Your inquiry has already been received — we will contact you soon.",
        });
      }

      const row = result.rows[0];
      const createdAtUTC = row.created_at_utc.toISOString();
      const createdAtIST = new Date(createdAtUTC).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
      });

      const lead = {
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        course: row.course,
        source: row.source,
        createdAt: createdAtIST,
        createdAtUTC,
      };

      // 1️⃣ Fire-and-forget notifications (DO NOT block user)
      console.log("📧 About to send email notification");

      (async () => {
        try {
          await sendLeadEmail(lead);
        } catch (e) {
          console.error("Email notification failed:", e);
        }

        // try {
        //   await addLeadToSheet(lead);
        // } catch (e) {
        //   console.error("Google Sheet update failed:", e);
        // }
      })();

      return res.status(201).json({
        message:
          "Thanks! Your inquiry has been received — we will contact you soon.",
        lead,
      });
    } catch (err) {
      console.error("DB insert error:", err);
      return res.status(500).json({ message: "Server error inserting lead." });
    }
  }

  // Fallback: in-memory storage
  const now = new Date();
  const createdAtUTC = now.toISOString();
  const createdAtIST = now.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  });

  const lead = {
    id: uuid(),
    name: name.trim(),
    email: email.trim().toLowerCase(),
    phone: cleanedPhone,
    course: course || "",
    source: "website",
    createdAt: createdAtIST,
    createdAtUTC,
  };

  // 2️⃣ Respond to client immediately (fast UX)
  res.status(201).json({
    message:
      "Thanks! Your inquiry has been received — we will contact you soon.",
    lead,
  });
});

/**
 * Get Leads (Admin)
 */
app.get("/leads", async (req, res) => {
  if (pool) {
    try {
      const rows = (
        await pool.query(`
          SELECT id, name, email, phone, course, source, created_at_utc
          FROM leads
          ORDER BY created_at_utc DESC
        `)
      ).rows;

      const out = rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        course: r.course,
        source: r.source,
        createdAtUTC: r.created_at_utc.toISOString(),
        createdAt: new Date(r.created_at_utc).toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
        }),
      }));

      return res.json(out);
    } catch (err) {
      console.error("DB fetch error:", err);
      return res.status(500).json({ message: "Server error fetching leads." });
    }
  }

  res.json(leads);
});

process.on("unhandledRejection", (reason, p) => {
  console.error("Unhandled Rejection at:", p, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

// netlify/functions/submit-lead.js — Netlify Function (CommonJS)
// Converted from the original Vercel serverless function.
// Netlify Functions use the (event, context) => ({ statusCode, headers, body }) signature
// instead of Vercel's (req, res).

const BREVO_CONTACTS_URL = "https://api.brevo.com/v3/contacts";
const BREVO_LIST_ID = 3; // "Consultation Leads"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}

exports.handler = async function handler(event) {
  // ── CORS ──────────────────────────────────────────────────────────────
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  // ── Environment check ────────────────────────────────────────────────
  if (!process.env.BREVO_API_KEY) {
    console.error("[submit-lead] BREVO_API_KEY is not set in environment variables.");
    return json(500, { error: "Server configuration error — API key missing." });
  }

  // ── Parse body ───────────────────────────────────────────────────────
  let body;
  try {
    body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    if (!body || typeof body !== "object") throw new Error("Empty body");
  } catch (e) {
    return json(400, { error: "Invalid request body." });
  }

  // ── Honeypot spam check — silently accept but do nothing further ──────
  if (body.company && String(body.company).trim() !== "") {
    console.warn("[submit-lead] Honeypot triggered — ignoring submission.");
    return json(200, { success: true });
  }

  // ── Validate required fields ────────────────────────────────────────
  const email = (body.email || "").trim().toLowerCase();
  const firstName = (body.firstName || "").trim();
  const lastName = (body.lastName || "").trim();
  const phone = (body.phone || "").trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { error: "A valid email address is required." });
  }
  if (!firstName) {
    return json(400, { error: "First name is required." });
  }

  // ── Build Brevo attributes (exact attribute IDs — do not rename) ──────
  const attributes = {};

  // Standard Brevo fields
  if (firstName) attributes.FIRSTNAME = firstName;
  if (lastName) attributes.LASTNAME = lastName;
  if (phone) attributes.SMS = phone;
  if (phone) attributes.PHONE = phone;

  // Custom tattoo fields
  if (body.CITY) attributes.CITY = body.CITY;
  if (body.TATTOO_SIZE) attributes.TATTOO_SIZE = body.TATTOO_SIZE;
  if (body.TATTOO_AGE) attributes.TATTOO_AGE = body.TATTOO_AGE;
  if (body.TATTOO_LOCATION) attributes.TATTOO_LOCATION = body.TATTOO_LOCATION;
  if (body.SKIN_TONE) attributes.SKIN_TONE = body.SKIN_TONE;
  if (body.TATTOO_COLORS) attributes.TATTOO_COLORS = body.TATTOO_COLORS;
  if (body.REMOVAL_GOAL) attributes.REMOVAL_GOAL = body.REMOVAL_GOAL;
  if (body.PREFERRED_CONTACT) attributes.PREFERRED_CONTACT = body.PREFERRED_CONTACT;
  if (body.MESSAGE) attributes.MESSAGE = body.MESSAGE;

  // Media
  if (body.PHOTO_URL) attributes.PHOTO_URL = body.PHOTO_URL;
  if (body.IMAGE_URL) attributes.IMAGE_URL = body.IMAGE_URL;

  // Consent & CRM
  // smsOptIn arrives from the frontend as a boolean (checkbox.checked) — map to Brevo's Yes/No string.
  attributes.SMS_OPT_IN = body.smsOptIn === true || body.smsOptIn === "true" ? "Yes" : "No";
  attributes.CONSENT_TIMESTAMP = body.CONSENT_TIMESTAMP || new Date().toISOString();
  attributes.LEAD_SOURCE = body.LEAD_SOURCE || "Landing Page";
  attributes.BOOKING_STATUS = body.BOOKING_STATUS || "Lead";

  // ── Brevo upsert payload ────────────────────────────────────────────
  // updateEnabled:true = upsert (create OR update — prevents duplicates)
  // listIds = adds to "Consultation Leads" list → triggers automations
  const brevoPayload = {
    email,
    attributes,
    listIds: [BREVO_LIST_ID],
    updateEnabled: true,
  };

  // ── Call Brevo API (15s timeout, matches frontend abort budget) ───────
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    let brevoRes;
    try {
      brevoRes = await fetch(BREVO_CONTACTS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "api-key": process.env.BREVO_API_KEY,
        },
        body: JSON.stringify(brevoPayload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    // 201 = new contact, 204 = updated existing — both are success
    if (brevoRes.status === 201 || brevoRes.status === 204) {
      console.log("[submit-lead] OK — contact upserted:", email);
      return json(200, { success: true });
    }

    // Parse Brevo error
    let errBody = { message: "Unknown Brevo error" };
    try { errBody = await brevoRes.json(); } catch (_) {}

    // Brevo returns 400 + code "duplicate_parameter" when contact is
    // already in the list with identical data — treat as success
    if (brevoRes.status === 400 && errBody.code === "duplicate_parameter") {
      console.log("[submit-lead] Contact already up to date:", email);
      return json(200, { success: true });
    }

    console.error("[submit-lead] Brevo error", brevoRes.status, errBody);
    return json(502, { error: errBody.message || "Brevo error." });

  } catch (err) {
    console.error("[submit-lead] Network error:", err.message);
    return json(502, { error: "Network error — please try again." });
  }
};

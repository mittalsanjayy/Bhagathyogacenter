require("dotenv").config();

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const Database = require("better-sqlite3");
const Razorpay = require("razorpay");

const ROOT = __dirname;
const DEFAULT_DATABASE_PATH = path.join(ROOT, ".data", "payments.sqlite");
const PLANS = Object.freeze({
  monthly: Object.freeze({ name: "Monthly membership", amountRupees: 2500 }),
  "three-months": Object.freeze({ name: "3-month membership", amountRupees: 6500 }),
  "six-months": Object.freeze({ name: "6-month membership", amountRupees: 12000 }),
  yearly: Object.freeze({ name: "Yearly membership", amountRupees: 18000 }),
  "complete-course": Object.freeze({ name: "Complete Yoga and Fitness course", amountRupees: 20000 })
});

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function getCredentials(env) {
  const keyId = typeof env.RAZORPAY_KEY_ID === "string" ? env.RAZORPAY_KEY_ID.trim() : "";
  const keySecret = typeof env.RAZORPAY_KEY_SECRET === "string" ? env.RAZORPAY_KEY_SECRET.trim() : "";
  const keyIdIsValid = /^rzp_(test|live)_[A-Za-z0-9]+$/.test(keyId);
  const keySecretIsValid = keySecret.length > 0 && keySecret !== "YOUR_RAZORPAY_KEY_SECRET";

  return {
    configured: keyIdIsValid && keySecretIsValid,
    keyId: keyIdIsValid ? keyId : "",
    keySecret
  };
}

function createPaymentStore(databasePath = DEFAULT_DATABASE_PATH) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new Database(databasePath);
  database.pragma("journal_mode = WAL");
  database.pragma("busy_timeout = 5000");
  database.exec(`
    CREATE TABLE IF NOT EXISTS payment_orders (
      idempotency_key TEXT PRIMARY KEY,
      order_token_hash TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      plan_name TEXT NOT NULL,
      amount_paise INTEGER NOT NULL,
      receipt TEXT NOT NULL UNIQUE,
      razorpay_order_id TEXT UNIQUE,
      razorpay_payment_id TEXT UNIQUE,
      status TEXT NOT NULL CHECK (status IN ('creating', 'created', 'verified', 'failed', 'cancelled', 'creation_failed')),
      failure_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      verified_at TEXT
    );
  `);
  return database;
}

function createOrderToken(keySecret, idempotencyKey) {
  return crypto.createHmac("sha256", keySecret).update(`order-access:${idempotencyKey}`).digest("hex");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest();
}

function tokenMatches(token, storedHash) {
  if (typeof token !== "string" || !storedHash) return false;
  const candidate = hashToken(token);
  const saved = Buffer.from(storedHash, "hex");
  return candidate.length === saved.length && crypto.timingSafeEqual(candidate, saved);
}

function isValidIdempotencyKey(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toPublicOrder(order) {
  return {
    orderId: order.razorpay_order_id,
    planId: order.plan_id,
    planName: order.plan_name,
    amount: order.amount_paise / 100,
    amountPaise: order.amount_paise,
    currency: "INR",
    status: order.status
  };
}

function requireGateway(env) {
  const credentials = getCredentials(env);
  if (!credentials.configured) {
    throw new HttpError(503, "Razorpay is not configured. Add your approved Test Mode or Live Mode credentials to the project .env file and restart the server.");
  }
  return credentials;
}

function createApp({
  env = process.env,
  database = createPaymentStore(),
  gatewayFactory = credentials => new Razorpay({ key_id: credentials.keyId, key_secret: credentials.keySecret })
} = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });
  app.use(express.json({ limit: "10kb" }));

  app.get("/api/config", (req, res) => {
    const credentials = getCredentials(env);
    res.json({
      configured: credentials.configured,
      keyId: credentials.configured ? credentials.keyId : "",
      plans: Object.entries(PLANS).map(([id, plan]) => ({
        id,
        name: plan.name,
        amount: plan.amountRupees,
        currency: "INR"
      }))
    });
  });

  app.post("/api/orders", async (req, res) => {
    const credentials = requireGateway(env);
    const { planId, idempotencyKey } = req.body || {};
    if (typeof planId !== "string" || !Object.hasOwn(PLANS, planId)) {
      throw new HttpError(400, "Choose a valid membership or course.");
    }
    if (!isValidIdempotencyKey(idempotencyKey)) {
      throw new HttpError(400, "A valid payment request ID is required. Please try again.");
    }

    const plan = PLANS[planId];
    const now = new Date().toISOString();
    const accessToken = createOrderToken(credentials.keySecret, idempotencyKey);
    let order = database.prepare("SELECT * FROM payment_orders WHERE idempotency_key = ?").get(idempotencyKey);

    if (order) {
      if (order.plan_id !== planId) {
        throw new HttpError(409, "This payment request was already used for a different plan. Start a new payment attempt.");
      }
      if (order.status === "created" || order.status === "verified") {
        return res.json({ ...toPublicOrder(order), keyId: credentials.keyId, accessToken });
      }
      if (order.status === "creating") {
        throw new HttpError(409, "This payment order is still being prepared. Please wait a moment and try again.");
      }
      throw new HttpError(409, "This payment request is no longer available. Start a new payment attempt.");
    }

    const receipt = `bhg_${crypto.randomUUID().replaceAll("-", "")}`;
    database.prepare(`
      INSERT INTO payment_orders (
        idempotency_key, order_token_hash, plan_id, plan_name, amount_paise,
        receipt, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'creating', ?, ?)
    `).run(
      idempotencyKey,
      hashToken(accessToken).toString("hex"),
      planId,
      plan.name,
      plan.amountRupees * 100,
      receipt,
      now,
      now
    );

    try {
      const gateway = gatewayFactory(credentials);
      const gatewayOrder = await gateway.orders.create({
        amount: plan.amountRupees * 100,
        currency: "INR",
        receipt,
        notes: { plan_id: planId, center: "Bhagath Yoga Center" }
      });

      if (
        typeof gatewayOrder.id !== "string" ||
        gatewayOrder.amount !== plan.amountRupees * 100 ||
        gatewayOrder.currency !== "INR"
      ) {
        throw new Error("Razorpay returned an order with unexpected details.");
      }

      const updatedAt = new Date().toISOString();
      database.prepare(`
        UPDATE payment_orders
        SET razorpay_order_id = ?, status = 'created', updated_at = ?
        WHERE idempotency_key = ? AND status = 'creating'
      `).run(gatewayOrder.id, updatedAt, idempotencyKey);

      order = database.prepare("SELECT * FROM payment_orders WHERE idempotency_key = ?").get(idempotencyKey);
      res.status(201).json({ ...toPublicOrder(order), keyId: credentials.keyId, accessToken });
    } catch (error) {
      database.prepare(`
        UPDATE payment_orders
        SET status = 'creation_failed', failure_reason = 'Order creation failed.', updated_at = ?
        WHERE idempotency_key = ? AND status = 'creating'
      `).run(new Date().toISOString(), idempotencyKey);
      throw error;
    }
  });

  app.post("/api/payments/verify", async (req, res) => {
    const credentials = requireGateway(env);
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body || {};
    if (
      typeof orderId !== "string" || orderId.length > 64 ||
      typeof paymentId !== "string" || paymentId.length > 64 ||
      typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature)
    ) {
      throw new HttpError(400, "Payment verification details are incomplete.");
    }

    const order = database.prepare("SELECT * FROM payment_orders WHERE razorpay_order_id = ?").get(orderId);
    if (!order) throw new HttpError(404, "This payment order could not be found.");

    const expectedSignature = crypto.createHmac("sha256", credentials.keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest();
    const suppliedSignature = Buffer.from(signature, "hex");
    if (!crypto.timingSafeEqual(expectedSignature, suppliedSignature)) {
      throw new HttpError(400, "The payment signature could not be verified. No successful payment is confirmed.");
    }

    if (order.status === "verified") {
      if (order.razorpay_payment_id !== paymentId) {
        throw new HttpError(409, "A different payment has already been confirmed for this order.");
      }
      return res.json({ status: "verified", order: toPublicOrder(order), paymentReference: paymentId });
    }

    const gateway = gatewayFactory(credentials);
    const payment = await gateway.payments.fetch(paymentId);
    if (
      payment.order_id !== orderId ||
      payment.amount !== order.amount_paise ||
      payment.currency !== "INR"
    ) {
      throw new HttpError(400, "The payment details do not match this order. No successful payment is confirmed.");
    }

    if (payment.status !== "captured") {
      if (payment.status === "failed") {
        database.prepare(`
          UPDATE payment_orders
          SET razorpay_payment_id = ?, status = 'failed',
              failure_reason = 'Payment was not captured.', updated_at = ?
          WHERE razorpay_order_id = ? AND status != 'verified'
        `).run(paymentId, new Date().toISOString(), orderId);
        return res.status(422).json({ status: "failed", error: "Razorpay reports that this payment failed. No enrollment is confirmed." });
      }
      throw new HttpError(409, "Razorpay has not captured this payment yet. No successful payment is confirmed.");
    }

    const verifiedAt = new Date().toISOString();
    const update = database.prepare(`
      UPDATE payment_orders
      SET razorpay_payment_id = ?, status = 'verified', failure_reason = NULL,
          updated_at = ?, verified_at = ?
      WHERE razorpay_order_id = ? AND status != 'verified'
    `).run(paymentId, verifiedAt, verifiedAt, orderId);
    const currentOrder = database.prepare("SELECT * FROM payment_orders WHERE razorpay_order_id = ?").get(orderId);
    if (update.changes === 0 && currentOrder.razorpay_payment_id !== paymentId) {
      throw new HttpError(409, "A different payment has already been confirmed for this order.");
    }
    res.json({ status: "verified", order: toPublicOrder(currentOrder), paymentReference: paymentId });
  });

  app.post("/api/payments/failure", async (req, res) => {
    const credentials = requireGateway(env);
    const { orderId, paymentId } = req.body || {};
    if (
      typeof orderId !== "string" || orderId.length > 64 ||
      typeof paymentId !== "string" || paymentId.length > 64
    ) {
      throw new HttpError(400, "Payment failure details are incomplete.");
    }

    const order = database.prepare("SELECT * FROM payment_orders WHERE razorpay_order_id = ?").get(orderId);
    if (!order) throw new HttpError(404, "This payment order could not be found.");

    const gateway = gatewayFactory(credentials);
    const payment = await gateway.payments.fetch(paymentId);
    if (
      payment.order_id !== orderId ||
      payment.amount !== order.amount_paise ||
      payment.currency !== "INR" ||
      payment.status !== "failed"
    ) {
      throw new HttpError(409, "Razorpay has not confirmed a failed payment for this order.");
    }

    database.prepare(`
      UPDATE payment_orders
      SET razorpay_payment_id = ?, status = 'failed',
          failure_reason = 'Payment was not captured.', updated_at = ?
      WHERE razorpay_order_id = ? AND status != 'verified'
    `).run(paymentId, new Date().toISOString(), orderId);
    res.json({ status: "failed" });
  });

  app.post("/api/orders/:orderId/cancel", (req, res) => {
    const credentials = requireGateway(env);
    const order = database.prepare("SELECT * FROM payment_orders WHERE razorpay_order_id = ?").get(req.params.orderId);
    if (!order || !tokenMatches(req.get("X-Order-Token"), order.order_token_hash)) {
      throw new HttpError(404, "This payment order could not be found.");
    }

    database.prepare(`
      UPDATE payment_orders
      SET status = 'cancelled', updated_at = ?
      WHERE razorpay_order_id = ? AND status = 'created'
    `).run(new Date().toISOString(), req.params.orderId);
    const updatedOrder = database.prepare("SELECT * FROM payment_orders WHERE razorpay_order_id = ?").get(req.params.orderId);
    res.json({ ...toPublicOrder(updatedOrder), paymentReference: updatedOrder.razorpay_payment_id || "" });
  });

  app.get("/api/orders/:orderId", (req, res) => {
    const credentials = requireGateway(env);
    const order = database.prepare("SELECT * FROM payment_orders WHERE razorpay_order_id = ?").get(req.params.orderId);
    if (!order || !tokenMatches(req.get("X-Order-Token"), order.order_token_hash)) {
      throw new HttpError(404, "This payment order could not be found.");
    }
    res.json({
      ...toPublicOrder(order),
      paymentReference: order.razorpay_payment_id || "",
      verifiedAt: order.verified_at
    });
  });

  app.use("/api", (req, res) => {
    res.status(404).json({ error: "API endpoint not found." });
  });

  app.use(express.static(ROOT, { dotfiles: "deny", index: "index.html" }));

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error("Payment server request failed:", error.message);
    res.status(502).json({ error: "The payment service could not complete this request. Please try again or contact the center." });
  });

  app.locals.database = database;
  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const databasePath =
    process.env.BHAGATH_DB_PATH || DEFAULT_DATABASE_PATH;

  const database = createPaymentStore(databasePath);
  const app = createApp({ database });

  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`Bhagath Yoga Center running on port ${port}`);

    if (!getCredentials(process.env).configured) {
      console.warn("Razorpay credentials are not configured.");
    }
  });

  server.on("close", () => database.close());
} else {
  const databasePath =
    process.env.BHAGATH_DB_PATH ||
    (process.env.VERCEL
      ? "/tmp/payments.sqlite"
      : DEFAULT_DATABASE_PATH);

  const database = createPaymentStore(databasePath);
  module.exports = createApp({ database });
}

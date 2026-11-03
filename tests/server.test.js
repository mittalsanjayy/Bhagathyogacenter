const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createApp, createPaymentStore, PLANS } = require("../server");

const credentials = {
  RAZORPAY_KEY_ID: "rzp_test_unit_test_key",
  RAZORPAY_KEY_SECRET: "unit_test_secret"
};

async function createTestServer({ env = credentials } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bhagath-razorpay-"));
  const database = createPaymentStore(path.join(directory, "payments.sqlite"));
  const payments = new Map();
  const createdOrders = [];
  const gatewayFactory = () => ({
    orders: {
      create: async order => {
        createdOrders.push(order);
        return {
          id: `order_unit_${createdOrders.length}`,
          amount: order.amount,
          currency: order.currency
        };
      }
    },
    payments: {
      fetch: async paymentId => {
        if (!payments.has(paymentId)) throw new Error("Payment not found in test gateway.");
        return payments.get(paymentId);
      }
    }
  });
  const app = createApp({ env, database, gatewayFactory });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    database,
    payments,
    createdOrders,
    close: async () => {
      await new Promise(resolve => server.close(resolve));
      database.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  };
}

async function postJson(baseUrl, route, body, headers = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
  return { response, data: await response.json() };
}

function signatureFor(orderId, paymentId) {
  return crypto.createHmac("sha256", credentials.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
}

test("publishes the five existing plans without exposing the Razorpay secret", async t => {
  const service = await createTestServer();
  t.after(service.close);

  const response = await fetch(`${service.baseUrl}/api/config`);
  const config = await response.json();
  assert.equal(config.configured, true);
  assert.equal(config.keyId, credentials.RAZORPAY_KEY_ID);
  assert.equal(JSON.stringify(config).includes(credentials.RAZORPAY_KEY_SECRET), false);
  assert.deepEqual(
    Object.fromEntries(config.plans.map(plan => [plan.id, plan.amount])),
    Object.fromEntries(Object.entries(PLANS).map(([id, plan]) => [id, plan.amountRupees]))
  );
});

test("creates idempotent orders with trusted prices instead of client amounts", async t => {
  const service = await createTestServer();
  t.after(service.close);
  const idempotencyKey = crypto.randomUUID();

  const first = await postJson(service.baseUrl, "/api/orders", {
    planId: "monthly",
    idempotencyKey,
    amount: 1,
    currency: "USD"
  });
  const retry = await postJson(service.baseUrl, "/api/orders", {
    planId: "monthly",
    idempotencyKey,
    amount: 1
  });

  assert.equal(first.response.status, 201);
  assert.equal(first.data.amount, 2500);
  assert.equal(first.data.amountPaise, 250000);
  assert.equal(first.data.currency, "INR");
  assert.equal(first.data.orderId, retry.data.orderId);
  assert.equal(service.createdOrders.length, 1);
  assert.equal(service.createdOrders[0].amount, 250000);
  assert.equal(service.createdOrders[0].currency, "INR");
  assert.equal(service.createdOrders[0].receipt.length <= 40, true);
  assert.equal(typeof first.data.accessToken, "string");
});

test("rejects unknown plans and reports missing credentials without opening checkout", async t => {
  const service = await createTestServer({ env: {} });
  t.after(service.close);

  const configResponse = await fetch(`${service.baseUrl}/api/config`);
  const config = await configResponse.json();
  const order = await postJson(service.baseUrl, "/api/orders", {
    planId: "monthly",
    idempotencyKey: crypto.randomUUID()
  });
  const invalidPlan = await postJson(service.baseUrl, "/api/orders", {
    planId: "made-up",
    idempotencyKey: crypto.randomUUID()
  });
  assert.equal(config.configured, false);
  assert.equal(config.keyId, "");
  assert.equal(order.response.status, 503);
  assert.match(order.data.error, /not configured/i);
  assert.equal(service.createdOrders.length, 0);
  assert.equal(invalidPlan.response.status, 500);
});

test("verifies the Razorpay signature and captured payment before returning success", async t => {
  const service = await createTestServer();
  t.after(service.close);
  const idempotencyKey = crypto.randomUUID();
  const created = await postJson(service.baseUrl, "/api/orders", {
    planId: "three-months",
    idempotencyKey
  });
  const paymentId = "pay_unit_captured";
  service.payments.set(paymentId, {
    id: paymentId,
    order_id: created.data.orderId,
    amount: 650000,
    currency: "INR",
    status: "captured"
  });
  const verification = {
    razorpay_order_id: created.data.orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: signatureFor(created.data.orderId, paymentId)
  };

  const verified = await postJson(service.baseUrl, "/api/payments/verify", verification);
  const duplicate = await postJson(service.baseUrl, "/api/payments/verify", verification);
  const resultResponse = await fetch(`${service.baseUrl}/api/orders/${created.data.orderId}`, {
    headers: { "X-Order-Token": created.data.accessToken }
  });
  const result = await resultResponse.json();

  assert.equal(verified.response.status, 200);
  assert.equal(verified.data.status, "verified");
  assert.equal(verified.data.paymentReference, paymentId);
  assert.equal(duplicate.data.status, "verified");
  assert.equal(result.status, "verified");
  assert.equal(result.amount, 6500);
  assert.equal(result.paymentReference, paymentId);
});

test("rejects forged signatures before contacting Razorpay", async t => {
  const service = await createTestServer();
  t.after(service.close);
  const created = await postJson(service.baseUrl, "/api/orders", {
    planId: "monthly",
    idempotencyKey: crypto.randomUUID()
  });
  const invalid = await postJson(service.baseUrl, "/api/payments/verify", {
    razorpay_order_id: created.data.orderId,
    razorpay_payment_id: "pay_forged",
    razorpay_signature: "0".repeat(64)
  });

  assert.equal(invalid.response.status, 400);
  assert.match(invalid.data.error, /signature/i);
  assert.equal(service.payments.size, 0);
});

test("does not confirm authorized payments or amounts that differ from the order", async t => {
  const service = await createTestServer();
  t.after(service.close);
  const created = await postJson(service.baseUrl, "/api/orders", {
    planId: "yearly",
    idempotencyKey: crypto.randomUUID()
  });
  const paymentId = "pay_unit_authorized";
  const authorizedPayment = {
    id: paymentId,
    order_id: created.data.orderId,
    amount: 1800000,
    currency: "INR",
    status: "authorized"
  };
  service.payments.set(paymentId, authorizedPayment);
  const authorized = await postJson(service.baseUrl, "/api/payments/verify", {
    razorpay_order_id: created.data.orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: signatureFor(created.data.orderId, paymentId)
  });
  const wrongAmountId = "pay_unit_wrong_amount";
  service.payments.set(wrongAmountId, { ...authorizedPayment, id: wrongAmountId, amount: 1, status: "captured" });
  const wrongAmount = await postJson(service.baseUrl, "/api/payments/verify", {
    razorpay_order_id: created.data.orderId,
    razorpay_payment_id: wrongAmountId,
    razorpay_signature: signatureFor(created.data.orderId, wrongAmountId)
  });

  assert.equal(authorized.response.status, 409);
  assert.match(authorized.data.error, /not captured/i);
  assert.equal(wrongAmount.response.status, 400);
  assert.match(wrongAmount.data.error, /do not match/i);
  const order = service.database.prepare("SELECT status FROM payment_orders WHERE razorpay_order_id = ?").get(created.data.orderId);
  assert.equal(order.status, "created");
});

test("requires the order token to read or cancel a payment", async t => {
  const service = await createTestServer();
  t.after(service.close);
  const created = await postJson(service.baseUrl, "/api/orders", {
    planId: "complete-course",
    idempotencyKey: crypto.randomUUID()
  });

  const denied = await fetch(`${service.baseUrl}/api/orders/${created.data.orderId}`);
  const cancelled = await postJson(
    service.baseUrl,
    `/api/orders/${created.data.orderId}/cancel`,
    {},
    { "X-Order-Token": created.data.accessToken }
  );
  const result = await fetch(`${service.baseUrl}/api/orders/${created.data.orderId}`, {
    headers: { "X-Order-Token": created.data.accessToken }
  });

  assert.equal(denied.status, 404);
  assert.equal(cancelled.data.status, "cancelled");
  assert.equal((await result.json()).status, "cancelled");
});

test("serves payment results and never serves the private environment file", async t => {
  const service = await createTestServer();
  t.after(service.close);

  const resultPage = await fetch(`${service.baseUrl}/payment-result.html`);
  const environmentFile = await fetch(`${service.baseUrl}/.env`);
  assert.equal(resultPage.status, 200);
  assert.equal((await resultPage.text()).includes("Checking your payment"), true);
  assert.notEqual(environmentFile.status, 200);
});

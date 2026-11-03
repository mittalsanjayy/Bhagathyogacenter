const selectedPlanMessage = document.getElementById("selected-plan-message");
const selectedPlanSummary = document.getElementById("selected-plan-summary");
const selectedPlanName = document.getElementById("selected-plan-name");
const selectedPlanPrice = document.getElementById("selected-plan-price");
const selectedPlanPayee = document.getElementById("selected-plan-payee");
const paymentSetupNote = document.getElementById("payment-setup-note");
const paymentStatus = document.getElementById("payment-status");
const paymentButton = document.getElementById("upi-pay-button");
const configNote = document.getElementById("razorpay-config-note");
const whatsappLink = document.getElementById("selected-plan-whatsapp");
const emailLink = document.getElementById("selected-plan-email");
const orderTokensStorageKey = "bhagath:razorpay-order-tokens";
let gatewayConfig = null;
let selectedPlan = null;
let checkoutInProgress = false;
let checkoutTerminal = false;
const pendingOrderKeys = new Map();

const configuredContactEmail = window.BHAGATH_SITE_CONFIG.contactEmail;
const contactEmail = typeof configuredContactEmail === "string" ? configuredContactEmail.trim() : "";
const contactEmailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail);
const contactEmailHref = contactEmailIsValid ? `mailto:${contactEmail}` : "index.html#contact";

function formatPrice(amount) {
  return `₹${Number(amount).toLocaleString("en-IN")}`;
}

function setCheckoutBusy(busy) {
  checkoutInProgress = busy;
  document.querySelectorAll("[data-plan-pay]").forEach(button => {
    button.disabled = busy;
    button.setAttribute("aria-busy", String(busy));
  });
  paymentButton.disabled = busy;
  paymentButton.setAttribute("aria-busy", String(busy));
}

function animatePaymentDetails(element) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof element.animate !== "function") return;
  element.getAnimations().forEach(animation => animation.cancel());
  element.animate(
    [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "translateY(0)" }],
    { duration: 420, easing: "cubic-bezier(.2, .7, .2, 1)" }
  );
}

function setSetupMessage(message) {
  paymentSetupNote.textContent = message;
  paymentSetupNote.hidden = false;
  animatePaymentDetails(paymentSetupNote);
}

function saveOrderToken(orderId, accessToken) {
  let tokens;
  try {
    tokens = JSON.parse(sessionStorage.getItem(orderTokensStorageKey) || "{}");
  } catch {
    tokens = {};
  }
  tokens[orderId] = accessToken;
  sessionStorage.setItem(orderTokensStorageKey, JSON.stringify(tokens));
}

function getOrderToken(orderId) {
  try {
    const tokens = JSON.parse(sessionStorage.getItem(orderTokensStorageKey) || "{}");
    return typeof tokens[orderId] === "string" ? tokens[orderId] : "";
  } catch {
    return "";
  }
}

function savePendingVerification(orderId, payment) {
  sessionStorage.setItem(`bhagath:razorpay-verification:${orderId}`, JSON.stringify(payment));
}

function navigateToResult(orderId) {
  window.location.assign(`payment-result.html?order_id=${encodeURIComponent(orderId)}`);
}

function selectPlan(planId) {
  const plan = gatewayConfig?.plans.find(item => item.id === planId);
  if (!plan) {
    selectedPlanMessage.textContent = "This payment option could not be loaded. Refresh the page or contact the center.";
    paymentStatus.textContent = "";
    return false;
  }

  selectedPlan = plan;
  selectedPlanMessage.textContent = "Review the plan and amount before continuing to secure Razorpay Checkout.";
  selectedPlanSummary.hidden = false;
  animatePaymentDetails(selectedPlanSummary);
  selectedPlanName.textContent = plan.name;
  selectedPlanPrice.textContent = formatPrice(plan.amount);
  selectedPlanPayee.textContent = "Bhagath Yoga Center";
  paymentStatus.textContent = "";
  paymentSetupNote.hidden = false;

  if (gatewayConfig.configured) {
    setSetupMessage("Razorpay Checkout will show the payment methods enabled for the center's account. Payment is confirmed only after server-side verification.");
    paymentButton.hidden = false;
  } else {
    setSetupMessage("Razorpay is not configured. Copy .env.example to .env, add your approved Razorpay Key ID and Key Secret, then restart the Node server. No payment has been started.");
    paymentButton.hidden = true;
  }

  const message = `Hello, I’d like to ask about the ${plan.name} (${formatPrice(plan.amount)}) at Bhagath Yoga Center.`;
  whatsappLink.href = `https://wa.me/${window.BHAGATH_SITE_CONFIG.whatsappPhone}?text=${encodeURIComponent(message)}`;
  emailLink.href = contactEmailIsValid
    ? `${contactEmailHref}?subject=${encodeURIComponent(`Enquiry: ${plan.name}`)}&body=${encodeURIComponent(message)}`
    : contactEmailHref;
  return true;
}

async function requestOrder(plan, idempotencyKey) {
  const response = await fetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planId: plan.id, idempotencyKey }),
    credentials: "same-origin",
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status !== 409 || !String(data.error || "").includes("still being prepared")) {
      pendingOrderKeys.delete(plan.id);
    }
    throw new Error(data.error || "A secure Razorpay order could not be created.");
  }
  return data;
}

async function verifyPayment(order, payment) {
  savePendingVerification(order.orderId, payment);
  const response = await fetch("/api/payments/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payment),
    credentials: "same-origin",
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 409) {
    throw new Error(data.error || "Payment verification is still pending.");
  }
  if (data.status !== "verified") {
    throw new Error(data.error || "Payment verification is still pending.");
  }
  sessionStorage.removeItem(`bhagath:razorpay-verification:${order.orderId}`);
  navigateToResult(order.orderId);
}

async function reportFailure(order, paymentId) {
  const response = await fetch("/api/payments/failure", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId: order.orderId, paymentId }),
    credentials: "same-origin",
    cache: "no-store"
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Razorpay could not confirm the payment failure.");
  }
}

async function cancelOrder(order) {
  const response = await fetch(`/api/orders/${encodeURIComponent(order.orderId)}/cancel`, {
    method: "POST",
    headers: { "X-Order-Token": order.accessToken },
    credentials: "same-origin",
    cache: "no-store"
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Checkout status could not be updated.");
  }
}

async function startCheckout(planId = selectedPlan?.id) {
  if (checkoutInProgress) return;
  if (!gatewayConfig) {
    paymentStatus.textContent = "Checking Razorpay configuration. Please wait a moment and try again.";
    return;
  }
  if (!selectPlan(planId)) return;
  if (!gatewayConfig.configured) {
    paymentStatus.textContent = "Razorpay Checkout is unavailable until valid credentials are added to the server .env file.";
    return;
  }
  if (typeof window.Razorpay !== "function") {
    paymentStatus.textContent = "Secure Razorpay Checkout could not be loaded. Check your internet connection and try again.";
    return;
  }

  let idempotencyKey = pendingOrderKeys.get(selectedPlan.id);
  if (!idempotencyKey) {
    if (typeof window.crypto?.randomUUID !== "function") {
      paymentStatus.textContent = "Secure payment setup is not available in this browser. Use an up-to-date browser over HTTPS or contact the center.";
      return;
    }
    idempotencyKey = window.crypto.randomUUID();
    pendingOrderKeys.set(selectedPlan.id, idempotencyKey);
  }

  setCheckoutBusy(true);
  paymentStatus.textContent = "Creating a secure order with the displayed amount…";
  let order;
  try {
    order = await requestOrder(selectedPlan, idempotencyKey);
    saveOrderToken(order.orderId, order.accessToken);
  } catch (error) {
    setCheckoutBusy(false);
    paymentStatus.textContent = error.message;
    return;
  }

  if (order.status === "verified") {
    navigateToResult(order.orderId);
    return;
  }
  if (order.status !== "created") {
    setCheckoutBusy(false);
    pendingOrderKeys.delete(selectedPlan.id);
    paymentStatus.textContent = "This payment order is no longer available. Please start a new payment attempt.";
    return;
  }

  const activePlan = selectedPlan;
  checkoutTerminal = false;
  try {
    const checkout = new window.Razorpay({
    key: order.keyId,
    amount: order.amountPaise,
    currency: order.currency,
    name: "Bhagath Yoga Center",
    description: order.planName,
    image: new URL("assets/logo.jpeg", window.location.href).href,
    order_id: order.orderId,
    theme: { color: "#223b31" },
    handler: async response => {
      if (!checkoutInProgress || checkoutTerminal) return;
      checkoutTerminal = true;
      pendingOrderKeys.delete(activePlan.id);
      paymentStatus.textContent = "Verifying your payment securely with Razorpay…";
      try {
        await verifyPayment(order, {
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature
        });
      } catch {
        navigateToResult(order.orderId);
      }
    },
    modal: {
      ondismiss: async () => {
        if (!checkoutInProgress || checkoutTerminal) return;
        checkoutTerminal = true;
        pendingOrderKeys.delete(activePlan.id);
        try {
          await cancelOrder(order);
        } catch {
          paymentStatus.textContent = "Checkout closed, but the server could not update its status. Check the result page before trying again.";
        }
        navigateToResult(order.orderId);
      }
    }
  });

    checkout.on("payment.failed", async event => {
      if (!checkoutInProgress || checkoutTerminal) return;
      checkoutTerminal = true;
      pendingOrderKeys.delete(activePlan.id);
      const paymentId = event?.error?.metadata?.payment_id;
      if (typeof paymentId === "string") {
        try {
          await reportFailure(order, paymentId);
        } catch {
          paymentStatus.textContent = "Razorpay has not yet confirmed this payment status. Do not retry until you check the result page or contact the center.";
        }
      }
      navigateToResult(order.orderId);
    });
    checkout.open();
  } catch {
    setCheckoutBusy(false);
    pendingOrderKeys.delete(activePlan.id);
    paymentStatus.textContent = "Razorpay Checkout could not be opened. No payment was confirmed. Please try again.";
  }
}

document.querySelectorAll("[data-plan-pay]").forEach(button => {
  button.addEventListener("click", () => startCheckout(button.dataset.planPay));
});

paymentButton.addEventListener("click", () => startCheckout());

async function loadGatewayConfig() {
  try {
    const response = await fetch("/api/config", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error("The payment server is unavailable.");
    gatewayConfig = await response.json();
    if (!Array.isArray(gatewayConfig.plans) || gatewayConfig.plans.length !== 5) {
      throw new Error("The payment plan configuration could not be loaded.");
    }

    configNote.textContent = gatewayConfig.configured
      ? "Secure Razorpay Checkout is ready. Supported payment methods depend on the center’s Razorpay account."
      : "Razorpay is not configured yet. Add approved credentials to .env and restart the Node server. No payments can be made until it is configured.";
    if (gatewayConfig.configured && gatewayConfig.keyId) {
      document.querySelectorAll("[data-plan-pay]").forEach(button => {
        const plan = gatewayConfig.plans.find(item => item.id === button.dataset.planPay);
        if (plan) {
          const price = button.closest(".plan-card")?.querySelector(".price-amount");
          if (price) price.textContent = formatPrice(plan.amount);
        }
      });
    }
    if (selectedPlan) selectPlan(selectedPlan.id);
  } catch (error) {
    configNote.textContent = `${error.message} Start the site with npm start; the static-only server cannot create or verify payments.`;
    gatewayConfig = { configured: false, plans: [] };
  }
}

const initialPlan = new URLSearchParams(window.location.search).get("plan");
loadGatewayConfig().then(() => {
  if (initialPlan && gatewayConfig.plans.some(plan => plan.id === initialPlan)) {
    selectPlan(initialPlan);
    document.getElementById("payment-details").scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

document.querySelectorAll("[data-contact-phone]").forEach(link => {
  link.href = `https://wa.me/${window.BHAGATH_SITE_CONFIG.whatsappPhone}`;
});
document.querySelectorAll("[data-contact-call]").forEach(link => {
  link.href = `tel:+${window.BHAGATH_SITE_CONFIG.whatsappPhone}`;
});
document.querySelectorAll("[data-contact-email]").forEach(link => {
  link.href = contactEmailHref;
});
document.querySelectorAll('[data-bind="email"]').forEach(element => {
  element.textContent = contactEmail;
});
document.querySelectorAll("[data-contact-instagram]").forEach(link => {
  link.href = window.BHAGATH_SITE_CONFIG.instagramUrl || "index.html#contact";
});

const menuButton = document.querySelector(".menu-toggle");
const primaryNav = document.getElementById("primary-nav");
function setMenuOpen(open) {
  menuButton.setAttribute("aria-expanded", String(open));
  menuButton.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  primaryNav.classList.toggle("is-open", open);
}
menuButton.addEventListener("click", () => {
  setMenuOpen(menuButton.getAttribute("aria-expanded") !== "true");
});
primaryNav.addEventListener("click", event => {
  if (event.target.closest("a")) setMenuOpen(false);
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && menuButton.getAttribute("aria-expanded") === "true") {
    setMenuOpen(false);
    menuButton.focus();
  }
});
window.addEventListener("resize", () => {
  if (window.innerWidth > 920) setMenuOpen(false);
});

document.getElementById("year").textContent = new Date().getFullYear();

(() => {
"use strict";

document.addEventListener("DOMContentLoaded", () => {


const form = document.getElementById("demoForm");
const confirmation = document.getElementById("confirmation");

const nameInput = document.getElementById("name");
const phoneInput = document.getElementById("phone");
const emailInput = document.getElementById("email");
const dateInput = document.getElementById("date");
const timeInput = document.getElementById("time");

const whatsappNumber = "918971669320";

// Check that all required HTML elements exist.
if (
  !form ||
  !confirmation ||
  !nameInput ||
  !phoneInput ||
  !emailInput ||
  !dateInput ||
  !timeInput
) {
  console.error("Demo form error: One or more required HTML elements are missing.");
  return;
}

// Get today's date in local time.
function getToday() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// Prevent selecting past dates.
dateInput.min = getToday();

// Generate a booking reference.
function generateReference() {
  const random = Math.floor(1000 + Math.random() * 9000);
  return `BGY-${Date.now().toString().slice(-5)}-${random}`;
}

// Format date.
function formatDate(value) {
  const parts = value.split("-");

  const date = new Date(
    Number(parts[0]),
    Number(parts[1]) - 1,
    Number(parts[2])
  );

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
}

// Show confirmation message.
function showConfirmation(reference) {
  confirmation.hidden = false;

  confirmation.textContent =
    `Your demo request is ready! Reference: ${reference}. ` +
    "WhatsApp will open with your details. Please press SEND to submit your request. " +
    "Your appointment is not confirmed until the yoga center responds.";
}

// Form submission.
form.addEventListener("submit", (event) => {

  event.preventDefault();

  const name = nameInput.value.trim();
  const phone = phoneInput.value.trim();
  const email = emailInput.value.trim();
  const date = dateInput.value;
  const time = timeInput.value;

  // Name validation.
  if (name.length < 2) {
    alert("Please enter your full name.");
    nameInput.focus();
    return;
  }

  // Indian mobile validation.
  if (!/^[6-9][0-9]{9}$/.test(phone)) {
    alert("Please enter a valid 10-digit Indian mobile number.");
    phoneInput.focus();
    return;
  }

  // Email validation.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    alert("Please enter a valid email address.");
    emailInput.focus();
    return;
  }

  // Date validation.
  if (!date || date < getToday()) {
    alert("Please select today or a future date.");
    dateInput.focus();
    return;
  }

  // Weekday validation.
  const selectedDate = new Date(date + "T12:00:00");
  const day = selectedDate.getDay();

  if (day === 0 || day === 6) {
    alert("Demo sessions are available Monday to Friday only. Please select another date.");
    dateInput.focus();
    return;
  }

  // Time validation.
  if (!time) {
    alert("Please select your preferred yoga session.");
    timeInput.focus();
    return;
  }

  // Generate reference number.
  const reference = generateReference();

  // Prepare WhatsApp message.
  const message = [
    "NAMASTE! I would like to request a FREE YOGA DEMO.",
    "",
    `Booking Reference: ${reference}`,
    "",
    `Name: ${name}`,
    `Mobile: ${phone}`,
    `Email: ${email}`,
    `Preferred Date: ${formatDate(date)}`,
    `Preferred Time: ${time}`,
    "",
    "Please contact me to confirm my demo session.",
    "",
    "Thank you!"
  ].join("\n");

  // Create WhatsApp URL.
  const whatsappURL =
    "https://wa.me/" +
    whatsappNumber +
    "?text=" +
    encodeURIComponent(message);

  // Show confirmation.
  showConfirmation(reference);

  // Open WhatsApp in a new tab.
  const whatsappTab = window.open(
    whatsappURL,
    "_blank",
    "noopener,noreferrer"
  );

  // Fallback for browsers that block pop-ups.
  if (!whatsappTab) {
    const openLink = document.createElement("a");

    openLink.href = whatsappURL;
    openLink.target = "_blank";
    openLink.rel = "noopener noreferrer";

    document.body.appendChild(openLink);
    openLink.click();
    openLink.remove();
  }

});


});

})();

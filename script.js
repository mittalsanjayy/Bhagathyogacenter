const SITE_CONFIG = window.BHAGATH_SITE_CONFIG;

/* Keep the published weekday timetable beside the shared business configuration. */
const SITE = {
  name: SITE_CONFIG.centerName,
  address: SITE_CONFIG.address,
  phoneDisplay: SITE_CONFIG.phoneDisplay,
  phoneNational: SITE_CONFIG.whatsappPhone,
  schedule: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].flatMap(day =>
    [
      { time: "06:00 AM – 07:00 AM", session: "Morning" },
      { time: "07:00 AM – 08:00 AM", session: "Morning" },
      { time: "08:30 AM – 09:30 AM", session: "Morning" },
      { time: "10:30 AM – 11:30 AM", session: "Morning" },
      { time: "05:00 PM – 06:00 PM", session: "Evening" },
      { time: "07:00 PM – 08:00 PM", session: "Evening" }
    ].map(slot => ({ day, className: "Yoga Class", ...slot }))
  )
};

function toIntlIndianMobile(value) {
  let digits = String(value).replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? `91${digits}` : null;
}

const intlPhone = toIntlIndianMobile(SITE.phoneNational);
if (!intlPhone) console.warn("SITE.phoneNational is not a valid Indian mobile number.");
const links = {
  tel: intlPhone ? `tel:+${intlPhone}` : "#contact",
  wa: intlPhone ? `https://wa.me/${intlPhone}` : "#contact",
  maps: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${SITE.name}, ${SITE.address}`)}`,
  email: SITE_CONFIG.contactEmail ? `mailto:${SITE_CONFIG.contactEmail}` : "#contact",
  instagram: SITE_CONFIG.instagramUrl || "#contact"
};

document.querySelectorAll("[data-bind]").forEach(element => {
  const key = element.dataset.bind;
  element.textContent = key === "phone" ? SITE.phoneDisplay : key === "email" ? SITE_CONFIG.contactEmail || "" : SITE[key] || "";
});
document.querySelectorAll("[data-bind-href]").forEach(element => {
  const destination = links[element.dataset.bindHref];
  if (destination) element.href = destination;
});
const structuredData = document.createElement("script");
structuredData.type = "application/ld+json";
structuredData.textContent = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "ExerciseGym",
  name: SITE.name,
  telephone: intlPhone ? `+${intlPhone}` : undefined,
  email: SITE_CONFIG.contactEmail || undefined,
  address: {
    "@type": "PostalAddress",
    streetAddress: SITE_CONFIG.streetAddress,
    addressLocality: SITE_CONFIG.addressLocality,
    addressRegion: SITE_CONFIG.addressRegion,
    postalCode: SITE_CONFIG.postalCode,
    addressCountry: "IN"
  }
});
document.head.append(structuredData);
document.getElementById("year").textContent = new Date().getFullYear();

/* Responsive navigation */
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

/* Weekday timetable filters */
const scheduleList = document.getElementById("schedule-list");
const dayFilters = document.getElementById("day-filters");
const scheduleCount = document.getElementById("schedule-count");
let selectedDay = "Monday";
let selectedSession = "all";
const scheduleDays = [...new Set(SITE.schedule.map(item => item.day))];
const dayOptions = [...scheduleDays.map(day => ({ label: day, value: day })), { label: "All Days", value: "all" }];

dayOptions.forEach(option => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `filter-chip${option.value === selectedDay ? " is-selected" : ""}`;
  button.dataset.dayFilter = option.value;
  button.setAttribute("aria-pressed", String(option.value === selectedDay));
  button.textContent = option.label;
  dayFilters.append(button);
});

function renderSchedule() {
  const entries = SITE.schedule.filter(item =>
    (selectedDay === "all" || item.day === selectedDay) &&
    (selectedSession === "all" || item.session === selectedSession)
  );
  scheduleList.replaceChildren();

  if (entries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "schedule-empty";
    empty.textContent = "No class times match these filters.";
    scheduleList.append(empty);
  } else {
    entries.forEach(item => {
      const row = document.createElement("article");
      row.className = "schedule-row";
      const time = document.createElement("span");
      time.className = "schedule-time";
      time.textContent = item.time;
      const details = document.createElement("div");
      details.className = "schedule-details";
      const name = document.createElement("span");
      name.className = "schedule-name";
      name.textContent = item.className;
      const detail = document.createElement("small");
      detail.className = "schedule-meta";
      detail.textContent = `${item.day} · ${item.session}`;
      details.append(name, detail);
      const ask = document.createElement("a");
      ask.className = "schedule-ask";
      ask.href = "#contact";
      ask.dataset.interest = item.className;
      ask.dataset.note = `I’d like to ask about the ${item.session.toLowerCase()} yoga class on ${item.day} at ${item.time}.`;
      ask.textContent = "Ask about this time ↗";
      row.append(time, details, ask);
      scheduleList.append(row);
    });
  }
  scheduleCount.textContent = `${entries.length} ${entries.length === 1 ? "class time" : "class times"}`;
}

dayFilters.addEventListener("click", event => {
  const button = event.target.closest("[data-day-filter]");
  if (!button) return;
  selectedDay = button.dataset.dayFilter;
  dayFilters.querySelectorAll("[data-day-filter]").forEach(option => {
    const selected = option === button;
    option.classList.toggle("is-selected", selected);
    option.setAttribute("aria-pressed", String(selected));
  });
  renderSchedule();
});
document.querySelectorAll("[data-type-filter]").forEach(button => {
  button.addEventListener("click", () => {
    selectedSession = button.dataset.typeFilter;
    document.querySelectorAll("[data-type-filter]").forEach(option => {
      const selected = option === button;
      option.classList.toggle("is-selected", selected);
      option.setAttribute("aria-pressed", String(selected));
    });
    renderSchedule();
  });
});
renderSchedule();

/* Class links carry their context into the enquiry without submitting it. */
const interestField = document.getElementById("interest");
const messageField = document.getElementById("message");
document.addEventListener("click", event => {
  const link = event.target.closest("[data-interest]");
  if (!link) return;
  const interest = link.dataset.interest;
  if ([...interestField.options].some(option => option.value === interest)) interestField.value = interest;
  if (link.dataset.note) messageField.value = link.dataset.note;
});

/* Keyboard-friendly image viewer with animated, accessible photo navigation. */
const lightbox = document.getElementById("lightbox");
const lightboxImage = document.getElementById("lightbox-image");
const closeLightbox = document.querySelector(".lightbox-close");
const previousLightboxImage = document.getElementById("lightbox-prev");
const nextLightboxImage = document.getElementById("lightbox-next");
const galleryButtons = [...document.querySelectorAll(".gallery-item")];
let lastGalleryTrigger = null;
let activeGalleryIndex = 0;
let lightboxIsClosing = false;

function showGalleryImage(index) {
  activeGalleryIndex = (index + galleryButtons.length) % galleryButtons.length;
  const button = galleryButtons[activeGalleryIndex];
  lightboxImage.src = button.dataset.full;
  lightboxImage.alt = button.dataset.alt;
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches && typeof lightboxImage.animate === "function") {
    lightboxImage.animate(
      [{ opacity: 0.62, transform: "scale(.985)" }, { opacity: 1, transform: "scale(1)" }],
      { duration: 300, easing: "cubic-bezier(.2, .7, .2, 1)" }
    );
  }
}

galleryButtons.forEach((button, index) => {
  button.addEventListener("click", () => {
    lastGalleryTrigger = button;
    lightboxIsClosing = false;
    showGalleryImage(index);
    lightbox.showModal();
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches && typeof lightbox.animate === "function") {
      lightbox.animate(
        [{ opacity: 0, transform: "translateY(12px) scale(.98)" }, { opacity: 1, transform: "translateY(0) scale(1)" }],
        { duration: 320, easing: "cubic-bezier(.2, .7, .2, 1)" }
      );
    }
    closeLightbox.focus();
  });
});

function moveGalleryImage(direction) {
  if (!galleryButtons.length || lightboxIsClosing) return;
  showGalleryImage(activeGalleryIndex + direction);
}

previousLightboxImage.addEventListener("click", () => moveGalleryImage(-1));
nextLightboxImage.addEventListener("click", () => moveGalleryImage(1));

function closeImageViewer() {
  if (!lightbox.open || lightboxIsClosing) return;
  lightboxIsClosing = true;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof lightbox.animate !== "function") {
    lightbox.close();
    return;
  }
  const closeAnimation = lightbox.animate(
    [{ opacity: 1, transform: "translateY(0) scale(1)" }, { opacity: 0, transform: "translateY(10px) scale(.985)" }],
    { duration: 180, easing: "ease-in", fill: "forwards" }
  );
  closeAnimation.onfinish = () => {
    if (lightbox.open) lightbox.close();
  };
}

closeLightbox.addEventListener("click", closeImageViewer);
lightbox.addEventListener("cancel", event => {
  event.preventDefault();
  closeImageViewer();
});
lightbox.addEventListener("click", event => {
  if (event.target === lightbox) closeImageViewer();
});
lightbox.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    event.preventDefault();
    closeImageViewer();
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    moveGalleryImage(-1);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    moveGalleryImage(1);
  }
});
lightbox.addEventListener("close", () => {
  lightboxIsClosing = false;
  lightbox.getAnimations().forEach(animation => animation.cancel());
  lightboxImage.getAnimations().forEach(animation => animation.cancel());
  lightboxImage.removeAttribute("src");
  if (lastGalleryTrigger) lastGalleryTrigger.focus();
});

/* Validate the enquiry form and prepare an email for the visitor to send. */

const form = document.getElementById("enquiry-form");
const formStatus = document.getElementById("form-status");

if (form && formStatus) {
  const fields = {
    name: {
      element: form.elements.name,
      error: document.getElementById("name-error")
    },
    phone: {
      element: form.elements.phone,
      error: document.getElementById("phone-error")
    },
    message: {
      element: form.elements.message,
      error: document.getElementById("message-error")
    }
  };

  const validators = {
    name: value =>
      value.trim().length >= 2
        ? ""
        : "Please enter your name.",

    phone: value =>
      typeof toIntlIndianMobile === "function" &&
      toIntlIndianMobile(value)
        ? ""
        : "Enter a valid 10-digit Indian mobile number.",

    message: value =>
      value.trim().length >= 5
        ? ""
        : "Please add a short message (at least 5 characters)."
  };

  function validateField(key) {
    const field = fields[key];
    const errorMessage = validators[key](field.element.value);

    if (field.error) {
      field.error.textContent = errorMessage;
    }

    field.element.setAttribute(
      "aria-invalid",
      String(Boolean(errorMessage))
    );

    return !errorMessage;
  }

  Object.entries(fields).forEach(([key, field]) => {
    field.element.addEventListener("input", () => {
      if (field.element.getAttribute("aria-invalid") === "true") {
        validateField(key);
      }

      formStatus.replaceChildren();
    });
  });

  form.addEventListener("submit", event => {
    event.preventDefault();

    const valid = Object.keys(fields)
      .map(validateField)
      .every(Boolean);

    if (!valid) {
      const firstInvalid = form.querySelector(
        '[aria-invalid="true"]'
      );

      if (firstInvalid) {
        firstInvalid.focus();
      }

      formStatus.textContent = "";
      return;
    }

    const name = form.elements.name.value.trim();
    const phone = form.elements.phone.value.trim();
    const interest = form.elements.interest
      ? form.elements.interest.value
      : "General enquiry";
    const message = form.elements.message.value.trim();

    const recipient = "vrshkanthi@gmail.com";

    const subject = encodeURIComponent(
      "New Enquiry - Bhagath Yoga Center"
    );

    const body = encodeURIComponent(
      "New enquiry from Bhagath Yoga Center website\n\n" +
      "Name: " + name + "\n" +
      "Phone: " + phone + "\n" +
      "Interested in: " + (interest || "General enquiry") + "\n\n" +
      "Message:\n" + message
    );

    const emailLink =
      "mailto:" + recipient +
      "?subject=" + subject +
      "&body=" + body;

    const link = document.createElement("a");

    link.href = emailLink;
    link.textContent = "Open email to review and send your enquiry ↗";

    formStatus.replaceChildren(
      document.createTextNode(
        "Your enquiry has not been sent yet. "
      ),
      link
    );

    link.focus();
  });
}
(() => {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) return;

  const animatedSelectors = [
    ".section-heading",
    ".story-photo",
    ".story-copy",
    ".principle",
    ".program-row",
    ".schedule-list",
    ".section-benefits > *",
    ".section-instructor > *",
    ".section-reviews > *",
    ".details-heading",
    ".details-grid > *",
    ".transformation-heading",
    ".transformation-card",
    ".gallery-top",
    ".gallery-grid > .gallery-item",
    ".pricing-copy",
    ".home-plan-card",
    ".contact-copy",
    ".enquiry-form",
    ".final-cta-inner",
    ".footer-main > *",
    ".footer-bottom",
    ".plan-card",
    ".payment-stories-heading",
    ".payment-photo-card",
    ".payment-testimonials-heading",
    ".payment-testimonial-card",
    ".payment-details",
    ".payment-reassurance"
  ];

  document.querySelectorAll(animatedSelectors.join(",")).forEach(element => {
    element.classList.add("reveal");
  });

  const revealElements = [...document.querySelectorAll(".reveal")];
  const hasGsap = Boolean(window.gsap && window.ScrollTrigger);

  if (!hasGsap) {
    if (!("IntersectionObserver" in window)) return;
    document.documentElement.classList.add("js");
    const observer = new IntersectionObserver((entries, currentObserver) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        currentObserver.unobserve(entry.target);
      });
    }, { threshold: 0.12 });
    revealElements.forEach(element => observer.observe(element));
    window.addEventListener("pagehide", () => observer.disconnect(), { once: true });
    return;
  }

  document.documentElement.classList.add("js", "gsap-ready");
  window.gsap.registerPlugin(window.ScrollTrigger);

  const context = window.gsap.context(() => {
    const { gsap, ScrollTrigger } = window;
    gsap.set(revealElements, { autoAlpha: 0, y: 24 });

    if (revealElements.length) {
      ScrollTrigger.batch(revealElements, {
        start: "top bottom",
        once: true,
        onEnter: elements => gsap.to(elements, {
          autoAlpha: 1,
          y: 0,
          duration: 0.82,
          stagger: 0.075,
          ease: "power3.out",
          clearProps: "transform"
        })
      });
    }

    const hero = document.querySelector(".hero");
    if (hero) {
      const heroCopy = [
        hero.querySelector(".eyebrow"),
        hero.querySelector("h1"),
        hero.querySelector(".hero-intro"),
        hero.querySelector(".hero-actions"),
        hero.querySelector(".hero-location")
      ].filter(Boolean);

      gsap.fromTo(heroCopy,
        { autoAlpha: 0, y: 24 },
        { autoAlpha: 1, y: 0, duration: 0.9, stagger: 0.13, ease: "power3.out", clearProps: "transform" }
      );

      const heroVisual = hero.querySelector(".hero-visual");
      const heroImage = hero.querySelector(".hero-photo img");
      gsap.fromTo(heroVisual,
        { autoAlpha: 0, y: 16 },
        { autoAlpha: 1, y: 0, duration: 1.15, delay: 0.12, ease: "power3.out", clearProps: "transform" }
      );
      gsap.fromTo(heroImage,
        { clipPath: "inset(0 0 7% 0)", scale: 1.075 },
        { clipPath: "inset(0 0 0 0)", scale: 1, duration: 1.4, delay: 0.16, ease: "power2.out" }
      );

      const wideMotion = gsap.matchMedia();
      wideMotion.add("(min-width: 760px)", () => {
        gsap.to(heroImage, {
          scale: 1.11,
          yPercent: 6,
          ease: "none",
          scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: 1 }
        });
        gsap.to(".hero-seal", {
          y: 22,
          ease: "none",
          scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: 1.2 }
        });

        const editorialPhotos = gsap.utils.toArray(".section-story .story-photo img, .section-details .visit-photo img");
        editorialPhotos.forEach(image => {
          gsap.fromTo(image, { yPercent: -3 }, {
            yPercent: 3,
            ease: "none",
            scrollTrigger: { trigger: image, start: "top bottom", end: "bottom top", scrub: 1.2 }
          });
        });

        const gallery = document.querySelector(".gallery-grid");
        if (gallery) {
          gsap.fromTo(gallery, { x: -8 }, {
            x: 8,
            ease: "none",
            scrollTrigger: { trigger: gallery, start: "top bottom", end: "bottom top", scrub: 1.2 }
          });
        }
      });

      const magneticMotion = gsap.matchMedia();
      magneticMotion.add("(min-width: 921px) and (hover: hover) and (pointer: fine)", () => {
        const controller = new AbortController();
        const buttons = hero.querySelectorAll(".hero-actions .button");
        buttons.forEach(button => {
          const moveX = gsap.quickTo(button, "x", { duration: 0.32, ease: "power3.out" });
          const moveY = gsap.quickTo(button, "y", { duration: 0.32, ease: "power3.out" });
          button.addEventListener("pointermove", event => {
            const bounds = button.getBoundingClientRect();
            moveX(Math.max(-5, Math.min(5, (event.clientX - bounds.left - bounds.width / 2) * 0.12)));
            moveY(Math.max(-5, Math.min(5, (event.clientY - bounds.top - bounds.height / 2) * 0.12)));
          }, { signal: controller.signal });
          button.addEventListener("pointerleave", () => {
            moveX(0);
            moveY(0);
          }, { signal: controller.signal });
        });
        return () => controller.abort();
      });
    }

    const revealPhotos = document.querySelectorAll(
      ".story-photo img, .visit-photo img, .transformation-image img, .gallery-grid .gallery-item img, .payment-photo-card img, .payment-testimonial-card img"
    );
    revealPhotos.forEach(image => {
      gsap.fromTo(image,
        { clipPath: "inset(5% 0 0 0)", scale: 1.04 },
        {
          clipPath: "inset(0% 0 0 0)",
          scale: 1,
          duration: 1.1,
          ease: "power2.out",
          scrollTrigger: { trigger: image.parentElement, start: "top 88%", once: true }
        }
      );
    });
  });

  window.addEventListener("pagehide", () => context.revert(), { once: true });
})();

# Bhagath Yoga Center

Responsive website for Bhagath Yoga Center. The pages use HTML, CSS, JavaScript, and local images; the payment page also requires the Node.js backend described below.

## Run the website

Install Node.js 20 or newer, open a terminal in the project root, and run:

```powershell
npm install
npm start
```

Open `http://localhost:3000/` or `http://localhost:3000/payments.html`. The Node server serves the website and payment API together. Do not use `python -m http.server` or a `file://` preview for payments: those do not provide the secure order-creation or verification endpoints. Stop the server with Ctrl+C.

## Razorpay configuration and testing

1. Copy `.env.example` to `.env` in the project root:

   ```powershell
   Copy-Item .env.example .env
   ```

2. In `.env`, replace `YOUR_RAZORPAY_KEY_ID` with the Key ID from **Razorpay Dashboard → Test Mode → Account & Settings → API Keys**, and `YOUR_RAZORPAY_KEY_SECRET` with its matching Key Secret. Keep the two values from the same mode. Restart `npm start` after changing credentials.
3. Use the existing plan buttons on `/payments.html`. The server sets the INR amount from its private plan catalog; the browser cannot choose the order amount. Razorpay Checkout offers the payment methods enabled for the account.
4. Make a real Test Mode checkout using Razorpay's current official test payment details. Confirm that the browser returns to `payment-result.html` and that the server reports success only after verifying the signature and checking Razorpay for a captured payment. Also test a declined/failed attempt and closing Checkout. Test Mode payments do not move real funds.
5. Run the local backend checks with `npm test`.

The Key ID is public and is returned to Checkout only when valid credentials are configured. The Key Secret is read only by the backend and must never be copied into HTML, JavaScript, source control, or a frontend environment variable. `.env` and the local `.data/` SQLite database are excluded by `.gitignore`. `.env.example` contains placeholders only.

Without credentials, the site still runs and shows a clear setup message; it does not simulate or confirm a payment. Replace the placeholders only after your Razorpay account is approved.

The payment database is stored in `.data/payments.sqlite`. Production hosting must run this Node server over HTTPS and provide persistent storage for `.data/`; do not deploy payments as a static site or to a serverless/ephemeral filesystem. Back up the database securely. For another host, add `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` as server-side environment variables in the host's secret manager instead of uploading `.env`.

### Switch to Live Mode

After account approval, replace both Test Mode values with the matching **Live Mode** Key ID and Key Secret in `.env` (or your hosting provider's secret settings), then restart/redeploy the backend. Live Key IDs start with `rzp_live_`; test IDs start with `rzp_test_`. Never mix a Key ID and Key Secret from different modes. Repeat a small real payment check and confirm the server-side verified status before using the live checkout operationally.

## Shared business configuration

Update existing business details in `site-config.js`:

- `contactEmail`: currently `vrshkanthi@gmail.com`
- `address`, `streetAddress`, `addressLocality`, `addressRegion`, and `postalCode`: currently Kulla Appa Circle, HRBR Layout, Kalyan Nagar, Bengaluru (560043)
- `phoneDisplay` and `whatsappPhone`: existing center phone
- `instagramUrl`: existing Instagram page
- `verifiedUpiId` and `verifiedUpiPayeeName`: the owner-provided UPI details

The homepage contact links, directions, structured data, payment-page email/phone/social links, and address display read from this configuration. No replacement email or address has been supplied; the values above are retained until the owner updates them here.

## Pages, plans, and timetable

- `index.html` is the homepage; `payments.html` is the plans and payments page.
- `script.js` renders the confirmed six Monday–Friday class times, weekday/session filters, enquiry validation, and image lightbox.
- `motion.js` adds optional GSAP/ScrollTrigger reveals, hero parallax, image transitions, and desktop-only CTA response. If GSAP is unavailable, it falls back to native scroll reveals; without animation support, content remains visible.
- `server.js` owns the trusted catalog for the five existing plans and creates Razorpay orders, verifies the Checkout signature, checks the payment is captured for the expected amount/order, and stores order status/payment references in SQLite.
- `payments.js` connects every existing plan button to Standard Checkout. `payment-result.html` and `payment-result.js` display success only after backend verification; failure, cancellation, and pending results are also explicit.
- The server plan catalog preserves the existing amounts: monthly ₹2,500, 3 months ₹6,500, 6 months ₹12,000, yearly ₹18,000, and Complete Yoga and Fitness course ₹20,000. Amounts are sent to Razorpay in paise by the backend.
- All local photos are in `assets/`. Preserve the directory and filenames when copying, deploying, or packaging the project. This includes `new.png`, `testimony.png`, `testimony2.png`, `testimony3.png`, and legacy-spelled files such as `secound.jpeg` and `fouth.jpeg`.

Payment success is not inferred from a browser callback alone. The server verifies Razorpay's HMAC signature and fetches the payment from Razorpay to confirm it is captured, for the matching order and exact server-side amount. Payment references and statuses are stored locally; access to a result requires a per-order token kept in the browser's session storage.

## Contact form behavior

The homepage form validates its fields in the browser and prepares a WhatsApp message for the visitor to review and send. It does not submit or store form details. A backend or form provider would be required for server-side submission.

## GitHub and Vercel

From the existing repository root, review and commit the project changes:

```powershell
git status
git add index.html payments.html script.js payments.js motion.js style.css payments.css site-config.js README.md
git commit -m "Add accessible motion system to yoga website"
git push
```

This working copy may not have a Git remote configured. If Git reports that it is not a repository, open the repository checkout in VS Code and copy the changed files into that checkout before running the commands above. Do not initialize a new repository over an existing project.

For hosting, use a Node.js service that runs `npm start`, configure the Razorpay credentials as server-side secrets, enable HTTPS, and attach persistent storage for `.data/`. Static-only deployment instructions are not suitable for this payment integration. Keep `assets/` and the root HTML/CSS/JS files in the project root.

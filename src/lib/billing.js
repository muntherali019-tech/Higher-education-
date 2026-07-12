// Payments, routed by BUILD (see platform.js):
//   - app build  -> Google Play Billing via RevenueCat (entitlement source of truth)
//   - web build  -> Stripe Checkout (server creates the session; webhook grants access)
// Development (`npm run dev`) uses an instant "mock" unlock so you can build the UX.
// A production build uses the real provider; override with VITE_BILLING=mock|revenuecat|stripe.
import { isApp } from "./platform.js";

const FORCED = (import.meta.env.VITE_BILLING || "").toLowerCase();      // "", mock, revenuecat, stripe, live
const isMock = FORCED ? FORCED === "mock" : !import.meta.env.PROD;       // dev => mock, prod => real
const provider = isApp() ? "play" : "stripe";                            // app => Play, web => Stripe
const RC_KEY = import.meta.env.VITE_REVENUECAT_KEY || "";
const PKG = "@revenuecat/purchases-capacitor";
const API = import.meta.env.VITE_API_BASE || "/api";

// Play / App Store product IDs (create these in the Play Console / App Store Connect).
export const PRODUCT_IDS = { junior: "whisker_junior_monthly", adult: "whisker_adult_monthly", family: "whisker_family_monthly" };
// RevenueCat entitlement identifiers.
export const ENTITLEMENTS = { junior: "junior", adult: "adult", family: "family" };

export function mode() { return isMock ? "mock" : provider; }            // "mock" | "play" | "stripe"
export function isLive() { return !isMock; }

function readToken() { try { return JSON.parse(localStorage.getItem("whisker.session"))?.token || ""; } catch { return ""; } }
function authHeaders() { const t = readToken(); return t ? { Authorization: `Bearer ${t}` } : {}; }

/* ---------------- RevenueCat (app build) ---------------- */
let _rc = null, _configured = false;
async function rc() { if (_rc) return _rc; const mod = await import(/* @vite-ignore */ PKG); _rc = mod.Purchases || mod.default || mod; return _rc; }

export async function configure() {
  if (isMock || provider !== "play" || _configured) return;
  try { const Purchases = await rc(); await Purchases.configure({ apiKey: RC_KEY }); _configured = true; } catch {}
}

function activeFromInfo(info) {
  const active = info?.customerInfo?.entitlements?.active || info?.entitlements?.active || {};
  const family = !!active[ENTITLEMENTS.family];
  return { junior: family || !!active[ENTITLEMENTS.junior], adult: family || !!active[ENTITLEMENTS.adult], family };
}

// { junior, adult } or null when unknown (mock, or web where entitlement lives on the account).
export async function getEntitlements() {
  if (isMock || provider !== "play") return null;
  try { await configure(); const Purchases = await rc(); return activeFromInfo(await Purchases.getCustomerInfo()); } catch { return null; }
}

/* ---------------- Stripe (web build) ---------------- */
async function stripeCheckout(plan) {
  const r = await fetch(`${API}/stripe/checkout`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ plan }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.url) throw new Error(j.error || "Couldn't start checkout.");
  window.location.assign(j.url);          // leaves the app for Stripe's hosted page
  return { ok: false, redirect: true };
}

/* ---------------- Public actions ---------------- */
// Buy a plan. Returns { ok } (mock/play) or { ok:false, redirect:true } (web → Stripe).
export async function purchase(plan) {
  if (isMock) return { ok: true, mock: true };
  if (provider === "stripe") return stripeCheckout(plan);
  await configure();
  const Purchases = await rc();
  const offerings = await Purchases.getOfferings();
  const pkgs = offerings?.current?.availablePackages || [];
  const pkg = pkgs.find((p) => (p.product?.identifier || p.identifier) === PRODUCT_IDS[plan]) || pkgs[0];
  if (!pkg) throw new Error("That subscription isn't available right now.");
  const res = await Purchases.purchasePackage({ aPackage: pkg });
  return { ok: !!activeFromInfo(res)[plan] };
}

export async function restore() {
  if (isMock) return { ok: true, mock: true };
  if (provider !== "play") return { ok: false, unsupported: true };       // web subs are tied to the account
  try { await configure(); const Purchases = await rc(); const ent = activeFromInfo(await Purchases.restorePurchases()); return { ok: !!(ent.junior || ent.adult), entitlements: ent }; }
  catch { throw new Error("Couldn't restore purchases."); }
}

// Localized price strings (e.g. "$3.99", "₹299") for the app build. Google Play converts/charges
// in the user's local currency; this surfaces the store's formatted price. null elsewhere.
export async function getPrices() {
  if (isMock || provider !== "play") return null;
  try {
    await configure();
    const Purchases = await rc();
    const offerings = await Purchases.getOfferings();
    const pkgs = offerings?.current?.availablePackages || [];
    const find = (id) => pkgs.find((p) => (p.product?.identifier || p.identifier) === id)?.product;
    const out = {};
    for (const plan of ["junior", "adult", "family"]) { const prod = find(PRODUCT_IDS[plan]); if (prod?.priceString) out[plan] = prod.priceString; }
    return Object.keys(out).length ? out : null;
  } catch { return null; }
}

/* ---------------- Gift subscriptions ---------------- */
// Buy a gift: in mock/dev this mints a code immediately; on the web build it
// starts a one-time Stripe Checkout, and the webhook mints the code (retrieved
// on return via getGiftCode). Returns { code } or { redirect:true }.
export async function giftCheckout(plan) {
  if (isMock) {
    const r = await fetch(`${API}/gift/mock-create`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ plan }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.code) throw new Error(j.error || "Couldn't create the gift.");
    return { code: j.code };
  }
  const r = await fetch(`${API}/gift/checkout`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ plan }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.url) throw new Error(j.error || "Couldn't start gift checkout.");
  window.location.assign(j.url);
  return { redirect: true };
}
// After returning from Stripe gift checkout, fetch the minted code for the session.
export async function getGiftCode(sessionId) {
  const r = await fetch(`${API}/gift/code?session_id=${encodeURIComponent(sessionId)}`);
  const j = await r.json().catch(() => ({}));
  return r.ok ? j.code || null : null;
}
// Redeem a gift code on the signed-in account. Returns { plan, months } on success.
export async function redeemGift(code) {
  const r = await fetch(`${API}/gift/redeem`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ code }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.error || "That code isn't valid or has already been used.");
  return j;
}

// Open the right place to manage/cancel a subscription. Play deep link (app) or Stripe portal (web).
export async function openManageSubscription() {
  if (isMock) return { ok: false, mock: true };
  if (provider === "play") { try { window.open("https://play.google.com/store/account/subscriptions", "_blank"); return { ok: true }; } catch { return { ok: false }; } }
  try {
    const r = await fetch(`${API}/stripe/portal`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.url) throw new Error(j.error || "Couldn't open the billing portal.");
    window.location.assign(j.url);
    return { ok: true, redirect: true };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
}

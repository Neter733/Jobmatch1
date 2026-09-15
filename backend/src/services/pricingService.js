import PricingSetting from '../models/PricingSetting.js';

// Default prices used only if the admin hasn't set one yet for that
// currency — NGN 200 is the real launch price; USD 100 ($1) was always a
// placeholder, now editable from the admin panel like everything else.
const DEFAULT_PRICES = { NGN: 20000, USD: 100 };

export async function getPriceForCurrency(currency) {
  const setting = await PricingSetting.findOne({ currency });
  return setting ? setting.amount : (DEFAULT_PRICES[currency] || DEFAULT_PRICES.NGN);
}

export async function listAllPrices() {
  const settings = await PricingSetting.find();
  const configured = Object.fromEntries(settings.map((s) => [s.currency, s.amount]));
  // Merge with defaults so currencies never explicitly set still show up
  // in the admin UI with their current effective price.
  return { ...DEFAULT_PRICES, ...configured };
}

export async function setPriceForCurrency(currency, amount) {
  return PricingSetting.findOneAndUpdate(
    { currency },
    { amount },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

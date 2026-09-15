import mongoose from 'mongoose';

// Per-currency price charged per job application, stored in minor units
// (kobo for NGN, cents for USD) — editable from the admin panel instead
// of hardcoded, so the price can change without a redeploy.
const pricingSettingSchema = new mongoose.Schema(
  {
    currency: { type: String, required: true, unique: true }, // 'NGN', 'USD'
    amount: { type: Number, required: true } // minor units — e.g. 20000 = ₦200
  },
  { timestamps: true }
);

export default mongoose.model('PricingSetting', pricingSettingSchema);

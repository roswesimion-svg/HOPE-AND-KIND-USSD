// M-Pesa STK callback: records the final result (amount, receipt, who paid) in the payments table.
const { recordResult } = require('../../lib/db');

module.exports = async (req, res) => {
  try {
    const cb = req.body && req.body.Body && req.body.Body.stkCallback;
    if (cb) {
      const items = (cb.CallbackMetadata && cb.CallbackMetadata.Item) || [];
      const get = (n) => (items.find((i) => i.Name === n) || {}).Value;
      console.log(`PAYMENT ${cb.ResultCode === 0 ? 'SUCCESS' : 'FAILED'}: ${cb.ResultDesc}`, JSON.stringify(cb));
      await recordResult({
        checkoutRequestId: cb.CheckoutRequestID,
        merchantRequestId: cb.MerchantRequestID,
        resultCode: cb.ResultCode,
        resultDesc: cb.ResultDesc,
        amount: get('Amount'),
        receipt: get('MpesaReceiptNumber'),
        paidPhone: get('PhoneNumber') != null ? String(get('PhoneNumber')) : null,
      });
    }
  } catch (e) {
    console.error('Callback error:', e.message);
  }
  // Always acknowledge so Safaricom does not keep retrying
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
};

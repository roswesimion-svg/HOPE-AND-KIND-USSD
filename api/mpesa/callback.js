// M-Pesa STK callback - saves the result to Supabase
const { db } = require('../_lib/db');

module.exports = async (req, res) => {
  const cb = req.body && req.body.Body && req.body.Body.stkCallback;
  try {
    if (cb && cb.CheckoutRequestID) {
      console.log(`PAYMENT ${cb.ResultCode === 0 ? 'SUCCESS' : 'FAILED'}: ${cb.ResultDesc}`, JSON.stringify(cb));
      const s = db();
      // Only act on payments we started ourselves
      const { data: pay } = await s.from('payments').select('*')
        .eq('checkout_request_id', cb.CheckoutRequestID).maybeSingle();

      if (pay && pay.status === 'pending') {
        if (cb.ResultCode === 0) {
          const items = (cb.CallbackMetadata && cb.CallbackMetadata.Item) || [];
          const get = (n) => (items.find((i) => i.Name === n) || {}).Value;
          await s.from('payments').update({
            status: 'success',
            amount: get('Amount') ?? pay.amount,
            mpesa_receipt: get('MpesaReceiptNumber') || null,
            result_desc: cb.ResultDesc,
            paid_at: new Date().toISOString(),
          }).eq('id', pay.id);
          await s.from('members').upsert(
            { phone: pay.phone, name: pay.name || 'Member' },
            { onConflict: 'phone', ignoreDuplicates: true }
          );
        } else {
          await s.from('payments').update({ status: 'failed', result_desc: cb.ResultDesc }).eq('id', pay.id);
        }
      }
    }
  } catch (e) {
    console.error('callback error', e);
  }
  // Always acknowledge so Safaricom doesn't keep retrying
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
};

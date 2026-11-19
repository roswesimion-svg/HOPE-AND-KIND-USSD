// M-Pesa STK callback - nothing is saved, result is logged only
module.exports = (req, res) => {
  const cb = req.body && req.body.Body && req.body.Body.stkCallback;
  if (cb) console.log(`PAYMENT ${cb.ResultCode === 0 ? 'SUCCESS' : 'FAILED'}: ${cb.ResultDesc}`, JSON.stringify(cb));
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
};

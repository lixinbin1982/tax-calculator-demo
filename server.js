const express = require('express');
const fetch = require('node-fetch');
const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.static('public'));
app.use(express.json());

const PAYPAL_CLIENT_ID = 'AVJ64pXVas3BtB-YrVVMFfCAZx2r2RlEjn0TwRtpGGNxqhhR-DRILDWX8gONSh-jSgunDQucOrVplXtm';
const PAYPAL_SECRET = 'EF7BTKS5-hA43DK29EJ9cfAvSWPKkaQ1tAd9wy6BeUhAtoZ55NSG-vddh42_zp1QXrCSa77dTCuJIMzj';
const baseURL = 'https://api-m.sandbox.paypal.com';

// Generate an access token
async function getAccessToken() {
  const auth = Buffer.from(PAYPAL_CLIENT_ID + ':' + PAYPAL_SECRET).toString('base64');
  const res = await fetch(baseURL + '/v1/oauth2/token', {
    method: 'POST',
    body: 'grant_type=client_credentials',
    headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  const data = await res.json();
  return data.access_token;
}

// Create order
app.post('/api/paypal/create-order', async (req, res) => {
  try {
    const { amount, description, quantity } = req.body;
    const accessToken = await getAccessToken();
    const orderRes = await fetch(baseURL + '/v2/checkout/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + accessToken
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          description: description || 'Cross-Border Order',
          amount: {
            currency_code: 'USD',
            value: amount.toFixed(2),
            breakdown: {
              item_total: {
                currency_code: 'USD',
                value: amount.toFixed(2)
              }
            }
          },
          items: [{
            name: description || 'Product',
            quantity: String(quantity || 1),
            unit_amount: {
              currency_code: 'USD',
              value: (amount / (quantity || 1)).toFixed(2)
            }
          }]
        }]
      })
    });
    const order = await orderRes.json();
    res.json({ id: order.id });
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Capture order
app.post('/api/paypal/capture-order', async (req, res) => {
  try {
    const { orderId } = req.body;
    const accessToken = await getAccessToken();
    const captureRes = await fetch(baseURL + '/v2/checkout/orders/' + orderId + '/capture', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + accessToken
      }
    });
    const captureData = await captureRes.json();
    res.json(captureData);
  } catch (err) {
    console.error('Capture order error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log('Tax Calculator server running at http://localhost:' + PORT);
});

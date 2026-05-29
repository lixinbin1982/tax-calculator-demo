const express = require('express');
const fetch = require('node-fetch');
const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.static('public'));
app.use(express.json());

const PAYPAL_CLIENT_ID = 'AVJ64pXVas3BtB-YrVVMFfCAZx2r2RlEjn0TwRtpGGNxqhhR-DRILDWX8gONSh-jSgunDQucOrVplXtm';
const PAYPAL_SECRET = 'EF7BTKS5-hA43DK29EJ9cfAvSWPKkaQ1tAd9wy6BeUhAtoZ55NSG-vddh42_zp1QXrCSa77dTCuJIMzj';
const baseURL = 'https://api-m.sandbox.paypal.com';

// ── Static Tax Calculator (fallback) ──────────────────────────

const US_STATES = {
  AL:{name:'Alabama',state:4,county:5},     AK:{name:'Alaska',state:0,county:1.76},
  AZ:{name:'Arizona',state:5.6,county:0.7}, AR:{name:'Arkansas',state:6.5,county:1.0},
  CA:{name:'California',state:7.25,county:1.0}, CO:{name:'Colorado',state:2.9,county:0.83},
  CT:{name:'Connecticut',state:6.35,county:0}, DE:{name:'Delaware',state:0,county:0},
  FL:{name:'Florida',state:6,county:1.05},  GA:{name:'Georgia',state:4,county:3.32},
  HI:{name:'Hawaii',state:4,county:0.44},   ID:{name:'Idaho',state:6,county:0.02},
  IL:{name:'Illinois',state:6.25,county:1.73}, IN:{name:'Indiana',state:7,county:0},
  IA:{name:'Iowa',state:6,county:0.94},     KS:{name:'Kansas',state:6.5,county:1.99},
  KY:{name:'Kentucky',state:6,county:0},    LA:{name:'Louisiana',state:4.45,county:5.0},
  ME:{name:'Maine',state:5.5,county:0},     MD:{name:'Maryland',state:6,county:0},
  MA:{name:'Massachusetts',state:6.25,county:0}, MI:{name:'Michigan',state:6,county:0},
  MN:{name:'Minnesota',state:6.875,county:0.58}, MS:{name:'Mississippi',state:7,county:0.07},
  MO:{name:'Missouri',state:4.225,county:1.73}, MT:{name:'Montana',state:0,county:0},
  NE:{name:'Nebraska',state:5.5,county:0},  NV:{name:'Nevada',state:6.85,county:1.29},
  NH:{name:'New Hampshire',state:0,county:0}, NJ:{name:'New Jersey',state:6.625,county:0},
  NM:{name:'New Mexico',state:5,county:2.72}, NY:{name:'New York',state:4,county:4.52},
  NC:{name:'North Carolina',state:4.75,county:2.22}, ND:{name:'North Dakota',state:5,county:0.5},
  OH:{name:'Ohio',state:5.75,county:1.41},  OK:{name:'Oklahoma',state:4.5,county:1.62},
  OR:{name:'Oregon',state:0,county:0},      PA:{name:'Pennsylvania',state:6,county:0.34},
  RI:{name:'Rhode Island',state:7,county:0}, SC:{name:'South Carolina',state:6,county:1.43},
  SD:{name:'South Dakota',state:4.5,county:1.9}, TN:{name:'Tennessee',state:7,county:2.47},
  TX:{name:'Texas',state:6.25,county:1.94}, UT:{name:'Utah',state:4.85,county:2.25},
  VT:{name:'Vermont',state:6,county:0.18},  VA:{name:'Virginia',state:4.3,county:1.33},
  WA:{name:'Washington',state:6.5,county:2.67}, WV:{name:'West Virginia',state:6,county:0.39},
  WI:{name:'Wisconsin',state:5,county:0.43}, WY:{name:'Wyoming',state:4,county:1.36},
  DC:{name:'Washington DC',state:6,county:0}
};

const EU_COUNTRIES = {
  AT:20, BE:21, BG:20, CY:19, CZ:21, DE:19, DK:25, EE:22, ES:21, FI:25.5,
  FR:20, GR:24, HR:25, HU:27, IE:23, IT:22, LT:21, LU:17, LV:21, MT:18,
  NL:21, PL:23, PT:23, RO:19, SE:25, SI:22, SK:23, GB:20, NO:25, CH:8.1
};

app.post('/api/calculate-tax', (req, res) => {
  try {
    const { region, stateCode, countryCode, amount, shipping, discount, productType, b2b } = req.body;
    const taxable = Math.max(0, (parseFloat(amount) || 0) - (parseFloat(discount) || 0));
    const ship = parseFloat(shipping) || 0;

    let taxAmount = 0, taxRate = 0, details = {};

    if (region === 'us' && US_STATES[stateCode]) {
      const s = US_STATES[stateCode];
      taxRate = s.state + s.county;
      taxAmount = (taxable + ship) * (taxRate / 100);
      details = {
        system: 'US Sales Tax',
        state: s.name,
        stateRate: s.state + '%',
        countyRate: s.county + '%',
        combinedRate: taxRate.toFixed(2) + '%'
      };
    } else if (region === 'eu' && EU_COUNTRIES[countryCode]) {
      const isB2B = b2b === 'yes';
      if (!isB2B) {
        taxRate = EU_COUNTRIES[countryCode];
        taxAmount = (taxable + ship) * (taxRate / 100);
        details = {
          system: 'EU VAT',
          country: countryCode,
          rate: taxRate + '%',
          regime: productType === 'digital' ? 'OSS Digital Goods' : 'Standard VAT'
        };
      } else {
        details = {
          system: 'EU VAT',
          country: countryCode,
          rate: '0% (reverse charge)',
          regime: 'B2B Reverse Charge'
        };
      }
    }

    res.json({
      success: true,
      subtotal: parseFloat(amount) || 0,
      discount: parseFloat(discount) || 0,
      taxable,
      shipping: ship,
      taxRate: taxRate,
      taxAmount,
      total: taxable + ship + taxAmount,
      details
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── PayPal endpoints ──────────────────────────────────────────

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

// ── Health / Status ──────────────────────────────────────────

app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', mode: 'static-rate-fallback', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log('Tax Calculator server running at http://localhost:' + PORT);
});

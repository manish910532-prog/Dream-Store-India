const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const DB_FILE = path.join(__dirname, 'products.json');
const ORDERS_FILE = path.join(__dirname, 'orders.json');
const USERS_FILE = path.join(__dirname, 'users.json');
const HTML_FILE = path.join(__dirname, 'index.html');

const FAST2SMS_API_KEY = "mJyF6KHB37Gu81Co2MxjQrXEdicvaw5TUseL9hYpPnNzqkVRZ0brdSITUR9WyCxo0cj42D5hseLuQ7pZ";

const seedProducts = [
  { id: 101, name: "Air Zoom Pro Athletic Running Shoes", category: "Footwear", price: 899, cutPrice: 1999, rating: "4.8", reviews: "1,240", img: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600", tag: "Hot Deal" },
  { id: 102, name: "STR CREATION Men Checkered Casual Beige Shirt", category: "Fashion", price: 418, cutPrice: 1499, rating: "4.2", reviews: "856", img: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600", tag: "Trending" },
  { id: 103, name: "HOUSE OF COMMON Wireless Over-Ear Headset", category: "Electronics", price: 500, cutPrice: 1999, rating: "4.5", reviews: "2,410", img: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600", tag: "Bestseller" },
  { id: 104, name: "Lucknowi Royal Cotton Festive Kurta", category: "Fashion", price: 699, cutPrice: 1699, rating: "4.6", reviews: "430", img: "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=600", tag: "Popular" },
  { id: 105, name: "Abros VOOR Athleisure Cushioned Sports Shoes", category: "Footwear", price: 935, cutPrice: 2699, rating: "4.4", reviews: "912", img: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=600", tag: "New" }
];

function readJSON(file, fallback) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
    return fallback;
  }
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch(e) { return fallback; }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let activeOtps = {};

function dispatchSms(mobile, otp, callback) {
  const targetUrl = `https://www.fast2sms.com/dev/bulkV2?authorization=${encodeURIComponent(FAST2SMS_API_KEY)}&variables_values=${encodeURIComponent(otp)}&route=otp&numbers=${encodeURIComponent(mobile)}`;

  https.get(targetUrl, (res) => {
    let raw = '';
    res.on('data', chunk => raw += chunk);
    res.on('end', () => {
      try { callback(null, JSON.parse(raw)); }
      catch(err) { callback(err); }
    });
  }).on('error', (err) => callback(err));
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathName = parsed.pathname;

  let products = readJSON(DB_FILE, seedProducts);
  let orders = readJSON(ORDERS_FILE, [
    { id: "OD42965809270", date: "Delivered on Aug 28", item: "HOUSE OF COMMON Wireless Over-Ear Headset", price: 500, status: "Delivered", address: "Priyal at home, Hathras", img: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=200" }
  ]);
  let users = readJSON(USERS_FILE, {});

  // 1. FRONTEND APP
  if (pathName === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(HTML_FILE));
  }

  // 2. PRODUCTS API
  if (pathName === '/api/products' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(products));
  }

  // 3. SEND OTP VIA SMS
  if (pathName === '/api/auth/send-otp' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { mobile } = JSON.parse(body);
        if (!mobile || mobile.length !== 10) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, message: "Invalid 10-digit mobile" }));
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        activeOtps[mobile] = otp;

        dispatchSms(mobile, otp, (err, apiRes) => {
          console.log(`[AUTH EVENT] OTP for +91-${mobile} is: ${otp}`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, otp, directCode: otp }));
        });
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: "Bad Request" }));
      }
    });
    return;
  }

  // 4. VERIFY OTP
  if (pathName === '/api/auth/verify-otp' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { mobile, otp } = JSON.parse(body);
        if (activeOtps[mobile] && activeOtps[mobile] === otp) {
          delete activeOtps[mobile];
          if (!users[mobile]) {
            users[mobile] = { firstName: "Manish", lastName: "Kumar", mobile, email: "manish910532@gmail.com", gender: "Male" };
            writeJSON(USERS_FILE, users);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, user: users[mobile] }));
        }
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: "Incorrect OTP entered" }));
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: "Bad request" }));
      }
    });
    return;
  }

  // 5. GET ORDERS API
  if (pathName === '/api/orders' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(orders));
  }

  // 6. UPDATE PROFILE API
  if (pathName === '/api/profile/update' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        if (payload.mobile) {
          users[payload.mobile] = { ...users[payload.mobile], ...payload };
          writeJSON(USERS_FILE, users);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, user: users[payload.mobile] }));
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`DREAM_STORE_READY on port: ${PORT}`);
});

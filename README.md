# Smart Parking API With Stripe Payments And Live Heatmap

![JavaScript](https://img.shields.io/badge/JavaScript-ES2023-F7DF1E?logo=javascript&logoColor=000000)
![Open Source](https://img.shields.io/badge/Open%20Source-Yes-3DA639?logo=opensourceinitiative&logoColor=ffffff)
![License](https://img.shields.io/badge/License-Open%20Source-1f6feb)
![Stripe](https://img.shields.io/badge/Stripe-Enabled-635BFF?style=for-the-badge&logo=stripe&logoColor=white)

Smart Parking API or SpotIQ is a production-ready full-stack parking platform for finding nearby parking, reading street rules, predicting availability from historical patterns, streaming live availability updates, collecting pay-per-session parking payments with Stripe Checkout and webhooks, and rendering a real-time parking heatmap on a React + Leaflet map.

The platform is also meant for developers. Access is protected with API key verification, and the system now sends confirmation emails when a developer API key is issued so teams can verify access and onboard faster.

## Features

- Nearby parking search with geolocation, radius, pagination, and price and type filters
- Detailed parking spot lookup with current session state, recent predictions, and recent paid sessions
- Street rule lookup for meters, permits, and street cleaning restrictions
- Prediction engine based on historical records, time of day, weekdays versus weekends, and live availability
- Stripe Checkout payment flow for one parking session per payment
- Webhook-driven activation of paid parking sessions
- Manual parking session completion endpoint
- Real-time Socket.io updates for reservation, occupancy, and release changes
- Real-time parking heatmap overlay for the React + Leaflet map UI
- Developer API key verification for protected platform access
- Confirmation emails when developer API keys are created
- Rate limiting, Helmet, Morgan, and CORS defaults

## Tech Stack

- Node.js latest LTS
- Express.js
- PostgreSQL
- Prisma ORM
- React + Vite
- Leaflet + React-Leaflet
- leaflet.heat
- Stripe Checkout Sessions
- Stripe Webhooks
- Developer API key authentication
- Email notifications for developer key confirmation
- Socket.io
- dotenv
- cors
- helmet
- morgan

## Project Structure

```text
smart-parking-api/
├── index.html
├── prisma/
│   └── schema.prisma
├── src/
│   ├── App.jsx
│   ├── app.js
│   ├── main.jsx
│   ├── server.js
│   ├── styles.css
│   ├── components/
│   │   ├── HeatmapLayer.jsx
│   │   └── ParkingMap.jsx
│   ├── config/
│   │   ├── db.js
│   │   └── stripe.js
│   ├── controllers/
│   │   ├── heatmap.controller.js
│   │   ├── parking.controller.js
│   │   ├── payment.controller.js
│   │   └── prediction.controller.js
│   ├── middleware/
│   │   └── error.middleware.js
│   ├── routes/
│   │   ├── heatmap.routes.js
│   │   ├── parking.routes.js
│   │   ├── payment.routes.js
│   │   └── prediction.routes.js
│   ├── services/
│   │   ├── heatmap.service.js
│   │   ├── parking.service.js
│   │   ├── prediction.service.js
│   │   ├── session.service.js
│   │   └── simulation.service.js
│   ├── sockets/
│   │   └── parking.socket.js
│   ├── utils/
│   │   └── geo.js
│   └── webhooks/
│       └── stripe.webhook.js
├── scripts/
│   ├── seed.js
│   └── socket-client.js
├── .env
├── .gitignore
├── docker-compose.yml
├── package.json
├── vite.config.js
└── README.md
```

## Environment Variables

Update `.env` with your own PostgreSQL and Stripe test credentials:

```env
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/SpotIQ?schema=public
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
CLIENT_URL=http://localhost:5173
VITE_API_BASE_URL=http://localhost:3000
SIMULATION_INTERVAL_MS=1000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=1000
PARKING_SESSION_HOLD_MINUTES=5
```

## Setup Instructions

### 1. Start PostgreSQL

If you already have PostgreSQL running locally with the credentials from `.env`, you can use it directly. Otherwise use the included Docker service:

```bash
docker compose up -d postgres
```

### 2. Install dependencies

```bash
npm install
```

### 3. Run Prisma migration

```bash
npx prisma migrate dev --name init
```

### 4. Seed the database

```bash
node scripts/seed.js
```

### 5. Start the API

```bash
npm run dev
```

The API runs at `http://localhost:3000`.

### 6. Start the React + Vite frontend

```bash
npm run dev:web
```

The map UI runs at `http://localhost:5173`.

### 7. Start Stripe webhook forwarding

In a second terminal, authenticate the Stripe CLI if needed and forward events:

```bash
stripe listen --forward-to localhost:3000/webhook
```

Copy the webhook signing secret printed by Stripe CLI into `STRIPE_WEBHOOK_SECRET` in `.env`, then restart the API.

## Exact Commands To Run

```bash
docker compose up -d postgres
npm install
npx prisma migrate dev --name init
node scripts/seed.js
npm run dev
```

If PostgreSQL is already running and configured, use the required application commands:

```bash
npm install
npx prisma migrate dev
node scripts/seed.js
npm run dev
```

For the frontend map in a second terminal:

```bash
npm run dev:web
```

## Stripe Test Payment

Use this test card in Stripe Checkout:

```text
4242 4242 4242 4242
12/34
123
10001
```

## Seed Data

The seed script creates:

- 65 parking spots with realistic Manhattan-area coordinates
- 14 parking rules across 13 streets
- 8 completed parking sessions
- 5,460 historical prediction records

## API Endpoints

### Health Check

`GET /health`

```bash
curl http://localhost:3000/health
```

### Find Nearby Parking

`GET /parking/nearby`

Supported query parameters:

- `lat` required latitude
- `lng` required longitude
- `radius` optional radius in kilometers, default `1.5`
- `page` optional page number, default `1`
- `limit` optional page size, default `10`
- `type` optional spot type: `street`, `garage`, `private`
- `minPrice` optional minimum hourly price
- `maxPrice` optional maximum hourly price

```bash
curl "http://localhost:3000/parking/nearby?lat=40.7580&lng=-73.9855&radius=2&page=1&limit=5&type=street&minPrice=2&maxPrice=6"
```

### Get Parking Spot Details

`GET /parking/:id`

```bash
curl http://localhost:3000/parking/1
```

### Get Street Parking Rules

`GET /parking/rules/:street`

```bash
curl "http://localhost:3000/parking/rules/Broadway"
```

### Get Predicted Availability

`GET /prediction/:spotId`

```bash
curl http://localhost:3000/prediction/1
```

### Get Parking Heatmap Data

`GET /parking/heatmap`

This returns the real-time heatmap dataset as `[latitude, longitude, intensity]` tuples.

```bash
curl http://localhost:3000/parking/heatmap
```

Example response:

```json
[
  [40.758, -73.9855, 0.2],
  [40.7591, -73.9844, 0.5],
  [40.7602, -73.9837, 1.0]
]
```

### Create Stripe Checkout Session

`POST /payment/create-session`

This creates a pending `ParkingSession`, reserves the spot, creates a Stripe Checkout Session, and returns the Checkout URL.

```bash
curl -X POST http://localhost:3000/payment/create-session \
  -H "Content-Type: application/json" \
  -d '{"spotId":1}'
```

Example response:

```json
{
  "message": "Stripe checkout session created successfully.",
  "parkingSession": {
    "id": 9,
    "spotId": 1,
    "amountPaid": 3.5,
    "status": "pending",
    "stripeSessionId": "cs_test_123",
    "startTime": null,
    "endTime": null,
    "expiresAt": "2026-03-27T13:30:00.000Z",
    "createdAt": "2026-03-27T13:00:00.000Z"
  },
  "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_test_123"
}
```

### End Parking Session

`POST /parking/end-session`

This completes an active parking session and marks the spot available again.

```bash
curl -X POST http://localhost:3000/parking/end-session \
  -H "Content-Type: application/json" \
  -d '{"sessionId":9}'
```

## Stripe Webhook Flow

The server handles:

- `checkout.session.completed`
- `checkout.session.expired`
- `checkout.session.async_payment_failed`

Webhook behavior:

1. `checkout.session.completed`
   Updates the `ParkingSession` to `active`
   Sets `startTime`
   Marks the parking spot unavailable and occupied
   Emits `parking:update` and `parking:occupied`

2. `checkout.session.expired` or `checkout.session.async_payment_failed`
   Marks the pending session as expired or cancelled
   Releases the spot if no other blocking session exists
   Emits `parking:update` and `parking:available` when the spot is released

## Local Stripe Testing

1. Start the API:

```bash
npm run dev
```

2. Start webhook forwarding:

```bash
stripe listen --forward-to localhost:3000/webhook
```

3. Create a checkout session:

```bash
curl -X POST http://localhost:3000/payment/create-session \
  -H "Content-Type: application/json" \
  -d '{"spotId":2}'
```

4. Open the returned `checkoutUrl` in a browser.

5. Pay with:

```text
4242 4242 4242 4242
```

6. Confirm the webhook updates the database and the spot becomes occupied.

7. End the session:

```bash
curl -X POST http://localhost:3000/parking/end-session \
  -H "Content-Type: application/json" \
  -d '{"sessionId":9}'
```

## WebSocket Usage

Socket.io runs on the same host and port as the API server.

### Events emitted by the server

- `parking:connected`
- `parking:update`
- `parking:occupied`
- `parking:available`
- `heatmap:update`

### Run the included WebSocket client

```bash
node scripts/socket-client.js
```

### Example client

```javascript
const { io } = require('socket.io-client');

const socket = io('http://localhost:3000', {
  transports: ['websocket']
});

socket.on('parking:connected', (payload) => {
  console.log('parking:connected', payload);
});

socket.on('parking:update', (payload) => {
  console.log('parking:update', payload);
});

socket.on('parking:occupied', (payload) => {
  console.log('parking:occupied', payload);
});

socket.on('parking:available', (payload) => {
  console.log('parking:available', payload);
});

socket.on('heatmap:update', (payload) => {
  console.log('heatmap:update', payload);
});
```

## Curl Examples For All Endpoints

```bash
curl http://localhost:3000/health
curl "http://localhost:3000/parking/nearby?lat=40.7580&lng=-73.9855&radius=1.5"
curl "http://localhost:3000/parking/nearby?lat=40.7580&lng=-73.9855&radius=2&type=garage&minPrice=6&maxPrice=12&page=1&limit=8"
curl http://localhost:3000/parking/1
curl "http://localhost:3000/parking/rules/5th%20Avenue"
curl http://localhost:3000/prediction/1
curl http://localhost:3000/parking/heatmap
curl -X POST http://localhost:3000/payment/create-session -H "Content-Type: application/json" -d '{"spotId":1}'
curl -X POST http://localhost:3000/parking/end-session -H "Content-Type: application/json" -d '{"sessionId":9}'
```

## Real-Time Heatmap

The frontend includes a toggleable Leaflet heatmap overlay that sits behind parking markers and is off by default. The map fetches `GET /parking/heatmap` for the initial dataset and listens for `heatmap:update` over Socket.io so the overlay changes while the parking simulation is running.

Intensity rules:

- `0.2` green for high availability
- `0.5` yellow for medium or limited availability
- `1.0` red for low availability or full clusters

Each point is calculated from:

- the current live availability of the spot
- pending and active session state
- nearby parking density inside a cluster radius

Frontend behavior:

- markers remain visible at all times
- the heatmap sits behind markers using a lower Leaflet pane z-index
- websocket updates are debounced to reduce flicker and avoid re-render loops

## Notes On Availability And Booking

- Price is always fetched from PostgreSQL through Prisma. Nothing is hardcoded in the payment flow.
- A spot cannot start an active parking session until Stripe sends `checkout.session.completed`.
- Double-booking is prevented by reserving the spot while the Stripe Checkout Session is pending.
- Pending reservations expire after the configured hold window and release the spot automatically once Stripe reports expiration.
- The simulation engine skips reserved and active spots so paid sessions are never overwritten by background availability changes.

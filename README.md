# TorLink

Appointment booking for barbershops and nail studios (Hebrew / Arabic), with automatic WhatsApp messages.

- `/b/<slug>`: the customer booking page
- `/m/<token>`: the customer's personal link to change or cancel a booking (sent in every WhatsApp message)
- `/admin/<slug>`: the business dashboard (PIN), with calendar, report, WhatsApp log, customers, services, hours and settings

## How it runs
- `public/index.html`: the whole web app
- `netlify/functions/api.mts`: the API (`/api/*`)
- `netlify/functions/reminders.mts`: runs hourly and sends tomorrow's reminders from 18:00 Israel time
- `netlify/lib/core.mts`: booking rules, availability and WhatsApp Cloud API sending
- Data lives in Netlify Blobs (store `torlink`).

## Environment variables (Netlify)
| Key | |
|---|---|
| `ADMIN_PIN` | PIN for the `demo` business, used only the first time it is created |
| `SUPER_KEY` | Key for creating new businesses (see below) |
| `PUBLIC_URL` | e.g. `https://torlink.netlify.app`, used in WhatsApp links |
| `WA_TOKEN`, `WA_PHONE_ID` | Meta WhatsApp Cloud API. When missing, the app runs in demo mode and messages are logged but not sent. See `SETUP-WHATSAPP.md` |

## Adding a business (customer)
```bash
curl -X POST https://torlink.netlify.app/api/super/create \
  -H "x-super-key: $SUPER_KEY" -H "content-type: application/json" \
  -d '{"slug":"la-barber","type":"barber","pin":"2580","name":{"he":"ל.א ברבר","ar":"ل.أ باربر"}}'
```
`type` is `barber` or `nails`. The response includes the booking link and the admin link.

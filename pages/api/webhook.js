import { buffer } from 'micro';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const config = {
    api: {
        bodyParser: false,
    },
};

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

async function insertOrder(order) {
    const response = await fetch(process.env.API_GATEWAY_URL_AWS, {
        method: 'POST',
        body: JSON.stringify(order),
        headers: {
            'Content-Type': 'application/json',
        },
    });
    return response.json();
}

export default async function handler(req, res) {
    if (req.method === 'POST') {
        const buf = await buffer(req);
        const sig = req.headers['stripe-signature'];

        let event;

        try {
            event = stripe.webhooks.constructEvent(buf.toString(), sig, webhookSecret);
        } catch (err) {
            console.error('Webhook signature verification failed.', err.message);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }

        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;

            const email = session.customer_email;

            await insertOrder({
                sessionId: session.id,
                items: session.display_items.map((item) => ({
                    name: item.custom.name,
                    price: item.amount_subtotal / 100,
                    quantity: item.quantity,
                })),
                email: email,
                status: 'completed',
                createdAt: new Date(),
            });
        }

        res.status(200).json({ received: true });
    } else {
        res.setHeader('Allow', 'POST');
        res.status(405).end('Method Not Allowed');
    }
}
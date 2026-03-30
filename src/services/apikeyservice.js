const { v4: uuidv4 } = require("uuid");
const { PrismaClient } = require("@prisma/client");
const nodemailer = require("nodemailer");

const prisma = new PrismaClient();

// Generate a nicely formatted API key
function generateApiKey() {
  return `spotiq_live_${uuidv4().replace(/-/g, "")}`;
}

// Create Gmail transporter
function getMailer() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

// Main function called from webhook
async function provisionApiKey(session) {
  const email = session.customer_details?.email || session.customer_email;
  const customerId = session.customer;

  if (!email) {
    console.error("No email found in session:", session.id);
    return;
  }

  // Generate and store the key
  const key = generateApiKey();

  await prisma.apiKey.create({
    data: {
      key,
      email,
      customerId,
    },
  });

  // Send the email
  const mailer = getMailer();

  await mailer.sendMail({
    from: `"SpotIQ" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: "Your SpotIQ API Key",
    html: `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
 <h2>Welcome to SpotIQ!</h2>
 <p>Thanks for subscribing. Here is your API key:</p>
 <div style="background: #f4f4f4; padding: 16px; border-radius: 8px; font-family: monospace; font-size: 16px;">
  ${key}
</div>
<p>Include it in your requests as a header:</p>
<div style="background: #f4f4f4; padding: 16px; border-radius: 8px; font-family: monospace;">
 x-api-key: ${key}
</div>
 <p>Keep this key safe — treat it like a password.</p>
 <p>Questions? Reply to this email anytime.</p>
 <p>— The SpotIQ Team</p>
</div>
`,
  });

    console.log(`API key provisioned and emailed to ${email}`);
}

module.exports = { provisionApiKey };

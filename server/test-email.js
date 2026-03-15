const { Resend } = require("resend");
require("dotenv").config();

const resend = new Resend(process.env.RESEND_API_KEY);

resend.emails.send({
  from: "ForeseesNetwork@resend.dev",
  to: "foreseesnetwork@gmail.com", // ← put your real email here
  subject: "Test from ForeseesNetwork",
  html: "<h1>Test email working!</h1>",
}).then((data) => {
  console.log("✅ Email sent:", data);
}).catch((err) => {
  console.error("❌ Error:", err);
});

require("dotenv").config();
const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendEmail() {
  try {
    const { data, error } = await resend.emails.send({
  from: "Christina <task@resend.dev>",
  to: ["christinasharanyaa11a@gmail.com"],
  subject: "Test Email from JavaScript",
  html: `
    <h2>Hello Christina!</h2>
    <p>Your Resend email integration is working.</p>
  `,
});

    if (error) {
      console.error("Failed to send email:", error);
      return;
    }

    console.log("Email sent successfully!");
    console.log("Email ID:", data.id);
  } catch (err) {
    console.error("Unexpected error:", err.message);
  }
}

sendEmail();

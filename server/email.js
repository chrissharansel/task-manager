
// require("dotenv").config();
// const { Resend } = require("resend");

// const resend = new Resend(process.env.RESEND_API_KEY);

// async function sendEmail() {
//   try {
//     const { data, error } = await resend.emails.send({
//   from: "Christina <task@resend.dev>",
//   to: ["christinasharanyaa11a@gmail.com"],
//   subject: "Test Email from JavaScript",
//   html: `
//     <h2>Hello Christina!</h2>
//     <p>Your Resend email integration is working.</p>
//   `,
// });

//     if (error) {
//       console.error("Failed to send email:", error);
//       return;
//     }

//     console.log("Email sent successfully!");
//     console.log("Email ID:", data.id);
//   } catch (err) {
//     console.error("Unexpected error:", err.message);
//   }
// }

// sendEmail();



require("dotenv").config();
const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendEmail() {
  try {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is missing from .env");
    }

    const from = process.env.RESEND_FROM;
    const to = process.env.RESEND_TO;
    const subject = process.env.RESEND_SUBJECT;
    const appUrl = process.env.APP_URL;

    if (!from || !to || !subject) {
      throw new Error(
        "RESEND_FROM, RESEND_TO, and RESEND_SUBJECT must be configured"
      );
    }

    const { data, error } = await resend.emails.send({
      from,
      to: to.split(",").map((email) => email.trim()),
      subject,
      html: `
        <h2>Hello!</h2>
        <p>Your Resend email integration is working.</p>
        ${appUrl ? `<p><a href="${appUrl}">Open Collab Tasks</a></p>` : ""}
      `,
    });

    if (error) {
      console.error("Failed to send email:", error);
      return;
    }

    console.log("Email sent successfully!");
    console.log("Email ID:", data?.id);
  } catch (err) {
    console.error("Email error:", err.message);
  }
}

sendEmail();

import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

export async function sendInviteEmail(email, inviteLink) {
  const transporter = nodemailer.createTransport({
    host: "smtp-relay.brevo.com", // or smtp.sendgrid.net, smtp.gmail.com, etc.
    port: 587,
    secure: false,
    auth: {
      user: process.env.BREVO_USER,
      pass: process.env.BREVO_SMTP_KEY,
    },
  });

  await transporter.sendMail({
    from: process.env.BREVO_USER,
    to: email,
    subject: "You’re Invited!",
    html: `<p>You’ve been invited to join the workspace. Click the link below to set your password and join:</p>
           <a href="${inviteLink}">${inviteLink}</a>
           <p>This link expires in 24 hours.</p>`,
  });
}

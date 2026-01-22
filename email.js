import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendLeadEmail(lead) {
  console.log("📧 sendLeadEmail() called", lead.email);

  const { name, email, phone, course, address, createdAt } = lead;

  await resend.emails.send({
    from: "Educadd <onboarding@resend.dev>",
    to: process.env.NOTIFY_EMAIL,
    subject: "📩 New Lead Received – Educadd",
    html: `
      <h3>New Lead Received</h3>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Phone:</strong> ${phone}</p>
      <p><strong>Course:</strong> ${course}</p>
      <p><strong>Address:</strong> ${address}</p>
      <p><strong>Time:</strong> ${createdAt}</p>
    `
  });
}

// import { Resend } from "resend";

// const resend = new Resend(process.env.RESEND_API_KEY);

// export async function sendLeadEmail(lead) {
//   console.log("📧 sendLeadEmail() called", lead.email);

//   const { name, email, phone, course, createdAt } = lead;

//   await resend.emails.send({
//     from: "Educadd <onboarding@resend.dev>",
//     to: process.env.NOTIFY_EMAIL,
//     subject: "📩 New Lead Received – Educadd",
//     html: `
//       <h3>New Lead Received</h3>
//       <p><strong>Name:</strong> ${name}</p>
//       <p><strong>Email:</strong> ${email}</p>
//       <p><strong>Phone:</strong> ${phone}</p>
//       <p><strong>Course:</strong> ${course}</p>
//       <p><strong>Time:</strong> ${createdAt}</p>
//     `
//   });
// }


import { Resend } from "resend";

if (!process.env.RESEND_API_KEY) {
  throw new Error("❌ RESEND_API_KEY is missing");
}

if (!process.env.NOTIFY_EMAIL) {
  throw new Error("❌ NOTIFY_EMAIL is missing");
}

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendLeadEmail(lead) {
  console.log("📧 sendLeadEmail() called", lead.email);

  const response = await resend.emails.send({
    from: "Educadd <onboarding@resend.dev>",
    to: process.env.NOTIFY_EMAIL,
    subject: "📩 New Lead Received – Educadd",
    html: `<p>New lead from ${lead.name}</p>`
  });

  console.log("📧 Resend response:", response);
}


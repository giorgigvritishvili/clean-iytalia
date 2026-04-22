require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

transporter.sendMail({
  from: process.env.SMTP_USER,
  to: process.env.ADMIN_EMAIL,
  subject: 'Test Email',
  text: 'This is a test email to check SMTP settings.'
}, (error, info) => {
  if (error) {
    console.error('Email sending failed:', error);
  } else {
    console.log('Email sent:', info.response);
  }
});

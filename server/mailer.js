const nodemailer = require("nodemailer");
require("dotenv").config();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendOtpEmail = async (toEmail, otp, username) => {
  await transporter.sendMail({
    from: `"ForeseesNetwork" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: "Your ForeseesNetwork Verification Code",
    html: `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; background: #f9f9f9; border-radius: 16px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #667eea, #f5576c); padding: 32px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">💬 ForeseesNetwork</h1>
        </div>
        <div style="padding: 32px;">
          <h2 style="color: #1a202c; margin: 0 0 8px;">Verify your email</h2>
          <p style="color: #718096; margin: 0 0 24px;">Hi <strong>${username}</strong>, use the code below to complete your registration.</p>
          <div style="background: #1a202c; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
            <span style="font-size: 36px; font-weight: 900; letter-spacing: 12px; color: #fff;">${otp}</span>
          </div>
          <p style="color: #a0aec0; font-size: 13px; margin: 0;">This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
        </div>
      </div>
    `,
  });
};

const sendPasswordResetEmail = async (toEmail, resetLink, username) => {
  await transporter.sendMail({
    from: `"ForeseesNetwork" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: "Reset your ForeseesNetwork password",
    html: `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; background: #f9f9f9; border-radius: 16px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #667eea, #f5576c); padding: 32px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">💬 ForeseesNetwork</h1>
        </div>
        <div style="padding: 32px;">
          <h2 style="color: #1a202c; margin: 0 0 8px;">Reset your password</h2>
          <p style="color: #718096; margin: 0 0 24px;">Hi <strong>${username}</strong>, click the button below to reset your password.</p>
          <a href="${resetLink}" style="display: block; background: linear-gradient(135deg, #667eea, #f5576c); color: white; text-align: center; padding: 16px; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 16px; margin-bottom: 24px;">Reset Password</a>
          <p style="color: #a0aec0; font-size: 13px; margin: 0;">This link expires in <strong>15 minutes</strong>. If you didn't request this, ignore this email.</p>
        </div>
      </div>
    `,
  });
};

module.exports = { sendOtpEmail, sendPasswordResetEmail };
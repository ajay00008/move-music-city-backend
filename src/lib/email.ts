import nodemailer from 'nodemailer';

// Create reusable transporter
const createTransporter = () => {
  // For development, use console logging if no email service is configured
  if (process.env.NODE_ENV === 'development' && !process.env.BREVO_SMTP_KEY && !process.env.SMTP_HOST) {
    return {
      sendMail: async (options: any) => {
        console.log('📧 Email would be sent:');
        console.log('To:', options.to);
        console.log('Subject:', options.subject);
        console.log('Body:', options.text || options.html);
        return { messageId: 'dev-mode' };
      },
    };
  }

  // Use Brevo (Sendinblue) if configured
  if (process.env.BREVO_SMTP_KEY) {
    if (!process.env.BREVO_SMTP_LOGIN) {
      throw new Error('BREVO_SMTP_LOGIN is required when using Brevo. Please set it in your .env file.');
    }
    
    return nodemailer.createTransport({
      host: process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com',
      port: parseInt(process.env.BREVO_SMTP_PORT || '587'),
      secure: process.env.BREVO_SMTP_SECURE === 'true', // true for 465, false for 587
      auth: {
        user: process.env.BREVO_SMTP_LOGIN, // Brevo SMTP login (e.g., 9f1295001@smtp-brevo.com)
        pass: process.env.BREVO_SMTP_KEY, // Brevo SMTP key as password
      },
    });
  }

  // Fallback to generic SMTP configuration
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
};

export const sendOtpEmail = async (email: string, otp: string) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.BREVO_SMTP_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@schoolhub.com',
      to: email,
      subject: 'Password Reset OTP - School Hub',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Password Reset OTP</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">School Hub</h1>
          </div>
          <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #333; margin-top: 0;">Password Reset Request</h2>
            <p>You have requested to reset your password. Please use the following OTP code to reset your password:</p>
            <div style="background: white; border: 2px dashed #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
              <p style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #667eea; margin: 0;">${otp}</p>
            </div>
            <p style="color: #666; font-size: 14px;">This code will expire in 10 minutes.</p>
            <p style="color: #666; font-size: 14px;">If you didn't request this password reset, please ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
            <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">© ${new Date().getFullYear()} School Hub. All rights reserved.</p>
          </div>
        </body>
        </html>
      `,
      text: `
        Password Reset OTP - School Hub
        
        You have requested to reset your password. Please use the following OTP code:
        
        ${otp}
        
        This code will expire in 10 minutes.
        
        If you didn't request this password reset, please ignore this email.
        
        © ${new Date().getFullYear()} School Hub. All rights reserved.
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent successfully:', info.messageId);
    return info;
  } catch (error) {
    console.error('❌ Error sending email:', error);
    throw error;
  }
};

const nodemailer = require('nodemailer');
const t = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: { 
    user: 'businessotp07@gmail.com', 
    pass: 'ztusrilyhpoifewo'  // ← replace with your real password
  }
});
t.sendMail({
  from: 'businessotp07@gmail.com',
  to:   'sanwalesandeep@gmail.com',
  subject: 'Test OTP',
  text: 'Your OTP is 123456'
})
.then(() => console.log('EMAIL SENT ✅'))
.catch(e => console.log('ERROR:', e.message));

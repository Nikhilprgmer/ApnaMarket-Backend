const nodemailer = require('nodemailer');
 
const transporter = nodemailer.createTransport({
  host:   'smtp.gmail.com',
  port:   465,
  secure: true,
  auth: {
    user: 'businesssotp07@gmail.com',
    pass: 'lsklvodauskbbvos' // ← replace this
  }
});
 
transporter.sendMail({
  from:    'businesssotp07@gmail.com',
  to:      'businesssotp07@gmail.com',
  subject: 'Test OTP 465',
  text:    'Your OTP is 123456'
})
.then(() => console.log('EMAIL SENT ✅ port 465 works!'))
.catch(e => console.log('ERROR:', e.message));
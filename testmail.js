// const nodemailer = require('nodemailer');
// const t = nodemailer.createTransport({
//   host: 'smtp.gmail.com',
//   port: 465,
//   secure: true,
//   auth: { 
//     user: 'businesssotp07@gmail.com', 
//     pass: 'ebzshswjdqhytywz'
//   }
// });
// t.sendMail({
//   from: 'businesssotp07@gmail.com',
//   to:   'businesssotp07@gmail.com',
//   subject: 'Test OTP',
//   text: 'Your OTP is 123456'
// })
// .then(() => console.log('EMAIL SENT ✅'))
// .catch(e => console.log('ERROR:', e.message));
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail', // simpler
  auth: {
    user: 'businesssotp07@gmail.com',
    pass: 'ebzshswjdqhytywz'
  }
});

async function sendMail() {
  try {
    await transporter.sendMail({
      from: 'businesssotp07@gmail.com',
      to: 'businesssotp07@gmail.com',
      subject: 'Test OTP',
      text: 'Your OTP is 123456'
    });

    console.log('EMAIL SENT ✅');
  } catch (e) {
    console.log('ERROR:', e.message);
  }
}

sendMail();
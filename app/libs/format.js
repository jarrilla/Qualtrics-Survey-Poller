//@ts-check

// format.js

// setup nodemailer
const nodemailer = require("nodemailer");
const sender_addr = process.env.MAILER_ADDR;
const sender_pwd = process.env.MAILER_PWD;
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: sender_addr,
    pass: sender_pwd
  }
});

// receiver address for errors
const dev_addr = process.env.DEV_ADDR;


// send error mail
async function sendMail(error, msg) {
  const title = "CMU.Pysch.Qualtrics.SurveyTracker Error -- " + msg;

  const mail_opts = {
    from: sender_addr,
    to: dev_addr,
    subject: title,
    text: error.toString()
  };

  try {
    await transporter.sendMail(mail_opts);
  }
  catch (e) {
    // oh well
    console.log(e);
  }
}

// -----------------------------------------
// -----------------------------------------
// -----------------------------------------

/**
 * 
 * @param {*} error the error thrown
 * @param {string} msg 
 * @param {number} status_code 
 */
function packError(error, msg, status_code=500) {
  sendMail(error, msg);

  return [{
    error: error,
    msg: msg,
    status_code: status_code
  }];
}

function packSuccess(data) {
  return [null, data];
}

module.exports = {
  packError: packError,
  packSuccess: packSuccess
};
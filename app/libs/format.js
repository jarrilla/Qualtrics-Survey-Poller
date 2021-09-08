//@ts-check

// format.js

// setup nodemailer
const nodemailer = require("nodemailer");

const SENDER_ADDR = process.env.MAILER_ADDR;
const SENDER_PWD = process.env.MAILER_PWD;
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: SENDER_ADDR,
    pass: SENDER_PWD
  }
});

// receiver address for errors
const ERROR_REPORTS_ADDR = process.env.ERROR_REPORTS_ADDR;

module.exports = {
  packError,
  packSuccess
};

// send error mail
async function sendMail(error, msg) {
  const title = "CMU.Pysch.Qualtrics.SurveyTracker Error -- " + msg;

  const mail_opts = {
    from: SENDER_ADDR,
    to: ERROR_REPORTS_ADDR,
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
  console.error(error);
  
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
// @ts-check

// app/libs/twilioApiHandlers.js
// All Twili API handlers.

// libs
const fmt = require("./format");

// set up twilio access
const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const SOURCE_NUMBER = process.env.TWILIO_PHONE_NUM;

let TWILIO_CLIENT;

module.exports = {
  SendMessage
};

(function _init_() {
  if ( !!ACCOUNT_SID && !!AUTH_TOKEN && !!SOURCE_NUMBER ) {
    TWILIO_CLIENT = require("twilio")(ACCOUNT_SID, AUTH_TOKEN);
  }
})();

/**
 * Send an SMS
 * @param {string} body the message body to send
 * @param {string} to the phone number to send the message to
 */
async function SendMessage(body, to) {

  if ( !TWILIO_CLIENT ) {
    console.debug(body);
  }
  else {
    try {
      const sid = await TWILIO_CLIENT.messages.create({
        body: body,
        to: formatPhoneNumber(to),
        from: formatPhoneNumber(SOURCE_NUMBER)
      });
  
      return fmt.packSuccess(sid);
    }
    catch (e) {
      return fmt.packError(e, `Unexpected error sending message to ${to}.`);
    }
  }
}

/**
 * Append country code to phone number if none exists
 * @param {string} s phone number string to format
 */
 function formatPhoneNumber(s) {
  return s.startsWith("+1") ? s : "+1"+s;
}
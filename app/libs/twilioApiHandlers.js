// @ts-check

// app/libs/twilioApiHandlers.js
// All Twili API handlers.

// libs
const fmt = require("./format");

// set up twilio access
const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const CLIENT = require("twilio")(ACCOUNT_SID, AUTH_TOKEN);
const SOURCE_NUMBER = process.env.TWILIO_PHONE_NUM;

/**
 * Append country code to phone number if none exists
 * @param {string} s phone number string to format
 */
function formatPhoneNumber(s) {
  return s.startsWith("+1") ? s : "+1"+s;
}

/**
 * Send an SMS
 * @param {string} body the message body to send
 * @param {string} to the phone number to send the message to
 */
async function sendMessage(body, to) {
  try {
    const sid = await CLIENT.messages.create({
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


module.exports = {
  sendMessage: sendMessage
};
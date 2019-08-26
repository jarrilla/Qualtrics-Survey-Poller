//@ts-check

// format.js

function packError(error, msg) {
  return [{
    trace: error,
    msg: msg
  }];
}

module.exports = {
  packError: packError
};
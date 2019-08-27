//@ts-check

// format.js

function packError(error, msg) {
  // TODO: log error to DB from here?
  return [{
    trace: error,
    msg: msg
  }];
}

function packData(data) {
  return [null, data];
}

module.exports = {
  packError: packError,
  packData: packData
};
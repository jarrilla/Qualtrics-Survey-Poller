//@ts-check

// libs/tools.js
// universal tools used in the app
// -----------------------------------------------
// -----------------------------------------------

module.exports = {
  getHoursMinutesFromTimeString24,
  getDifferentIndices
}
// -----------------------------------------------

/**
 * get Hour and Minutes from a 24-hour time string
 * @param {string} s the string to parse.. format: "hh:ss" (0-23:0-59)
 */
function getHoursMinutesFromTimeString24(s) {
  const match = s.match(/(\d{1,2}):(\d{2})/);
  
  return match ? {Hour: Number(match[1]), Minute: Number(match[2])} : null;
}

/**
 * Return an array of indices in which 2 same-length arrays differ
 * @param {any[]} arr1 
 * @param {any[]} arr2 
 */
function getDifferentIndices(arr1, arr2) {
  const ret = [];
  
  const len = arr1.length;
  for (let i=0; i < len; i++) {
    if (arr1[i] !== arr2[i]) ret.push(i);
  }

  return ret;
}
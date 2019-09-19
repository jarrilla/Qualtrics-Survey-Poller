// @ts-check

// libs/config.js
// user-set config settings (globals)
// these are infrequently updated, so we just store them in memory
// rather than in DB (no need for frequent lookup)
//----------------------------------------------
//----------------------------------------------

const IS_DEBUG = process.env.NODE_ENV === "debug";

// { number }
// delay between interval triggers
let INTERVAL_DELAY; // (10 minutes)

// { boolean }
//  if true, use node-schedule to only poll inside settings.RESTRICTED_SCHEDULE
let IS_SCHEDULE_RESTRICTED;

// { {Start: date, End: date} }
// start and end times for when twilio is allowed to send SMS
const RESTRICTED_SCHEDULE = {};

// { boolean }
//  if set to true, if a survey is inactive when polling, untrack it & remove it
let REMOVE_INACTIVE;

// { [boolean] }
// schedule of when tracking is allowed
// init function will fill from DB o/w default value is never allowed
// Monday=0, Tuesday=1, etc...
let ALLOWED_DAYS;

// { boolean }
// if FALSE, no polling is done on that day
// managed by node-schedule according to settings.ALLOWED_DAYS
let IS_TODAY_ALLOWED;

//----------------------------------------------
module.exports = {
  init,
  updateAppSettings,

  // getters
  getIntervalDelay,
  getIsScheduleRestricted,
  getRestrictedSchedule,
  getRemoveInactive,
  getAllowedDays,
  getIsTodayAllowed,

  // debug
  IS_DEBUG
}
//----------------------------------------------


// packages ------------------------------------
const nodeSchedule = require("node-schedule");
//----------------------------------------------


// libs ----------------------------------------
const
dbHandlers    = require("./dbHandlers"),
fmt           = require("./format"),
qualtrics     = require("./qualtricsApiHandlers"),
tools         = require("./tools");
//----------------------------------------------


// Helper functions ----------------------------
function updateAllowedDays(diffIndicesArray) {
  const arr = ALLOWED_DAYS;
  for (let i=0; i < diffIndicesArray.length; i++) {
    // updated memory
    const k = diffIndicesArray[i];
    const b = arr[k];
    arr[k] = !b;

    // updated scheduler
    nodeSchedule.scheduleJob( makeRuleAtMidnightOnDay(k) , function(x) {
      IS_TODAY_ALLOWED = x;
    }.bind(null, arr[k]));
  }

  const day_today = new Date().getDay();
  // today changed.. flip now (otherwise, have to wait til next week)
  if ( diffIndicesArray.includes(day_today) ) {
    IS_TODAY_ALLOWED = !IS_TODAY_ALLOWED;
  }
}

/**
 * Restore nodeSchedule rules for (un)allowing days.
 * call once on init()
 */
function restoreRestrictedScheduleRules() {
  const arr = ALLOWED_DAYS;
  for (let i=0; i < arr.length; i++) {
    const b = arr[i];

    nodeSchedule.scheduleJob( makeRuleAtMidnightOnDay(i) , function(x) {
      IS_TODAY_ALLOWED = b;
    }.bind(null, b));
  }
}

/**
 * 
 * @param {number | null} day (0-6) or (null) for every day
 */
function makeRuleAtMidnightOnDay(day) {
  if (day < 0 || day > 6) return null;

  const rule = new nodeSchedule.RecurrenceRule();
  rule.minute = 0;
  rule.hour = 5; // (offset by +5 b/c of UTC timezone difference)
  if (day !== null) rule.dayOfWeek = day;

  return rule;
}
//----------------------------------------------


// Exported functions --------------------------
async function init() {
  console.assert(!IS_DEBUG, "Loading settings...");

  const [sett_err, sett_data] = await dbHandlers.readStoredSettings();
  if (sett_err) return [sett_err]

  if (sett_data) {
    const settings = sett_data.Item;

    REMOVE_INACTIVE = settings.remove_inactive;
    INTERVAL_DELAY = settings.poll_interval * 60 * 1000; // stored as (min) we want (ms)
    ALLOWED_DAYS = settings.allowed_days.map(x => JSON.parse(x));
    IS_SCHEDULE_RESTRICTED = JSON.parse(settings.is_schedule_restricted);
    RESTRICTED_SCHEDULE.Start = settings.restricted_schedule[0];
    RESTRICTED_SCHEDULE.End = settings.restricted_schedule[1];
  }
  else {
    REMOVE_INACTIVE = true;
    INTERVAL_DELAY = 10*60*1000;
    ALLOWED_DAYS = Array(7).fill(false);
    IS_SCHEDULE_RESTRICTED = false;
    RESTRICTED_SCHEDULE.Start = "08:00";
    RESTRICTED_SCHEDULE.End = "23:00";
  }

  // is today allowed?
  IS_TODAY_ALLOWED = ALLOWED_DAYS[ new Date().getDay() ];

  // debug polling delay
  if (IS_DEBUG) INTERVAL_DELAY = 30*1000; // debug only

  // setup scheduled response reset at midnight (or 1 during EDT) every day
  nodeSchedule.scheduleJob( makeRuleAtMidnightOnDay(null) , function() {
    qualtrics.resetAllSurveyCounters();
  });

  return fmt.packSuccess(null);
}

async function updateAppSettings(bulk_settings) {
  // sanitize polling interval
  let { PollInterval } = bulk_settings;
  if (PollInterval < 5) {
    PollInterval = 5;
    bulk_settings.PollInterval = 5;
  }

  if (IS_DEBUG) {
    // always set polling to whatever in debug
    PollInterval = 0.5;
    bulk_settings.PollInterval - 0.5;
  }

  const [db_err, ] = await dbHandlers.updateStoredSettings(bulk_settings);
  if (db_err) return [db_err];

  // db update successful, update in memory now
  const { RemoveInactive , IsScheduleRestricted, RestrictedSchedule } = bulk_settings;
  const AllowedDays = bulk_settings.AllowedDays.map(x => JSON.parse(x));
  PollInterval *= (60 * 1000);

  // rebalance tracking if interval changed
  const do_rebalance = (INTERVAL_DELAY != PollInterval);

  // re-schedule IS_TODAY_ALLOWED if allowed days changed
  const diff_days = tools.getDifferentIndices( ALLOWED_DAYS, AllowedDays );
  const do_dayChange = diff_days.length > 0;

// updated globals
  REMOVE_INACTIVE = RemoveInactive;
  ALLOWED_DAYS = AllowedDays;
  INTERVAL_DELAY = PollInterval;
  IS_SCHEDULE_RESTRICTED = JSON.parse(IsScheduleRestricted);
  RESTRICTED_SCHEDULE.Start = RestrictedSchedule[0],
  RESTRICTED_SCHEDULE.End = RestrictedSchedule[1];

  // rebalance if delay changed
  if (do_rebalance) qualtrics.updateIntervalDelay();

  // fire node-schedule when necessary
  if (do_dayChange) updateAllowedDays(diff_days);

  return fmt.packSuccess(null);
}

function getIntervalDelay() { return INTERVAL_DELAY; }
function getIsScheduleRestricted() { return IS_SCHEDULE_RESTRICTED; }
function getRestrictedSchedule() { return RESTRICTED_SCHEDULE; }
function getRemoveInactive() { return REMOVE_INACTIVE; }
function getAllowedDays() { return ALLOWED_DAYS; }
function getIsTodayAllowed() { return IS_TODAY_ALLOWED; }
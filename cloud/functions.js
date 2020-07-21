
const Event = Parse.Object.extend("Event");
const Place = Parse.Object.extend("Place");
const EventRequest = Parse.Object.extend("EventRequest");
const Settings = Parse.Object.extend("Settings");
const Notification = Parse.Object.extend("Notification");

/**
 * Add two numbers together
 * @param  {Number} num1 The first number
 * @param  {Number} num2 The second number
 * @return {Number}      The total of the two numbers
 */

Parse.Cloud.define("recentEvents", async (request) => {
  const queryEvent = new Parse.Query(Event);

  var currentLocation = request.params.currentLocation;
  var distanceRadio = request.params.distanceRadio;
  if (currentLocation != null && distanceRadio != null ) {
    var innerQuery = new Parse.Query(Place);
    innerQuery.withinKilometers("coordinate", currentLocation, distanceRadio, false);
    queryEvent.matchesQuery("place", innerQuery);
  }

  var user = request.user;
  const queryUserEvents = new Parse.Query(Event);
  if (user != null) {
    queryUserEvents.equalTo("createdBy", user);
  }

  var mainQuery = Parse.Query.or(queryEvent, queryUserEvents);
  mainQuery.descending("createdAt");
  mainQuery.include("createdBy");

  const yesterday = (function() {
    this.setDate(this.getDate() - 20);
    return this
  })
  .call(new Date)

  mainQuery.greaterThan("createdAt", yesterday);

  const results = await mainQuery.find();
  return results;
});

/**
 * Add two numbers together
 * @param  {Number} num1 The first number
 * @param  {Number} num2 The second number
 * @return {Number}      The total of the two numbers
 */

Parse.Cloud.define("statusRequestForEvent", async (request) => {

  var user = request.user;
  var eventId = request.params.eventObjectId;

  if (user == null && !request.master) {
    throw "🐲: You need to be authenticated 😏. What are you doing 🌚?";
  }

  const queryEvent = new Parse.Query(Event);
  queryEvent.include("place");

  const event = await queryEvent.get(eventId, {useMasterKey:true});

  const userRequestsQuery = new Parse.Query(EventRequest);
  userRequestsQuery.equalTo("user", user);
  userRequestsQuery.equalTo("event", event);
  const userRequests = await userRequestsQuery.first();

  if (userRequests == null) {
    return undefined;
  }

  const eventPlace = event.get("place")
  if (userRequests.get("isAccepted") != true || eventPlace == null) {
    return userRequests;
  }

  return eventPlace
});

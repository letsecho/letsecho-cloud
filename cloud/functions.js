
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
    return {"status": "notRequested", "request": null, "place": null};
  }

  var eventPlace = null
  var currentStatus = "pending"

  if (userRequests.get("isAccepted") == false) {
    currentStatus = "rejected"
  } else if (userRequests.get("isAccepted") == true) {
    currentStatus = "attending"
    eventPlace = event.get("place")
  }

  return {"status": currentStatus, "request": userRequests, "place": eventPlace}
});

Parse.Cloud.define("yelpPlaces", async (request) => {
	const YELP_API = process.env.YELP_API;

  const latitude = request.params.latitude;
  const longitude = request.params.longitude;
  const radius = request.params.radius != null ? request.params.radius : 500;

  var user = request.user;

  if (user == null && !request.master) {
    throw "🐲: You need to be authenticated 😏. What are you doing 🌚?";
  }

  if (latitude == null || longitude == null ) {
    throw "🐲: Provide latitude and longitude. What are you doing 🌚?";
  }

  const response = await Parse.Cloud.httpRequest({
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${YELP_API}`
    },
    url: `https://api.yelp.com/v3/businesses/search?sort_by=distance&radius=${radius}&latitude=${latitude}&longitude=${longitude}`,
    success: function(httpResponse) {
      response.success();
    },
    error: function(httpResponse) {
      response.error(httpResponse);
    }
  });

  return response.data.businesses
});

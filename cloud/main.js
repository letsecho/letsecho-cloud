// The first deployed file must be named main.js and must be placed on the root of the cloud folder.
// The example below shows you how a cloud code function looks like.

/*
 * Parse.Cloud.define("hello", function(request, response){
 *     response.success("Hello world!");
 * });
 */

// To see it working, you only need to call it through SDK or REST API.
// Here is how you have to call it via REST API:

// If you have set a function in another cloud code file, called "test.js" (for example)
// you need to refer it in your main.js, as you can see below:

/* require("./test.js"); */

const logger = require('parse-server').logger;


const NotificationType = Object.freeze({
  eventRequest: { key: "EVENT_REQUEST", message: "EVENT_REQUEST_FORMAT"},
  eventUpdate: { key: "EVENT_UPDATE", message:  "EVENT_UPDATE_FORMAT"},
  eventRequestAccepted: { key: "EVENT_REQUEST_ACCEPTED", message:  "EVENT_REQUEST_ACCEPTED_FORMAT"}
});

function sendNotification(user, relatedUser, relatedEvent, type){

  const Notification = Parse.Object.extend("Notification");

  var notification = new Notification();
  notification.set("forUser", user);
  notification.set("relatedUser", relatedUser);
  notification.set("relatedEvent", relatedEvent);
  notification.set("type", type.key);
  notification.set("message", type.message);

  var acl = new Parse.ACL();
  acl.setReadAccess(user.id, true);
  acl.setWriteAccess(user.id, true);

  notification.setACL(acl);

  notification.save()
  .then((eventRequest) => {
    // Execute any logic that should take place after the object is saved.
    console.error('New object created with objectId: ' + notification.id);
  }, (error) => {
    // Execute any logic that should take place if the save fails.
    // error is a Parse.Error with an error code and message.
    console.error('Failed to create new object, with error code: ' + error.message);
  });
}

// Save
Parse.Cloud.beforeSave("Event", (request) => {

  var user = request.user;

  if (user == null && !request.master) {
    throw "You need to be authenticated 😏. What are you doing 🌚?";
  }

  if (!request.object.isNew()) {
    request.context = { isEditing: true };
    return
  }

  request.object.set("createdBy", user)
  request.object.set("isAvailable", true)

  var acl = new Parse.ACL();
  acl.setPublicReadAccess(true);
  acl.setWriteAccess(user.id, true);

  request.object.setACL(acl);
});

Parse.Cloud.afterSave("Event", (request) => {

  const context = request.context;

  if (context.isEditing === true) {
    const event = request.object;
    const user = event.get("createdBy");

    const EventRequest = Parse.Object.extend("EventRequest");

    var queryEventRequest = new Parse.Query(EventRequest);
    queryEventRequest.equalTo("event", event);

    queryEventRequest.find()
    .then(function(eventRequests) {
      for (var i = 0; i < eventRequests.length; i++) {
        let currentUser = eventRequests[i].get("user");
        if (user.id === currentUser.id) {
          continue;
        }
        sendNotification(currentUser, null, event, NotificationType.eventUpdate);
      }
    })
    .catch(function(error) {
      logger.error("sending notification Event " + error.code + " : " + error.message);
    });

    return
  }

  const EventRequest = Parse.Object.extend("EventRequest");

  // Create a new instance of that class.
  var eventRequest = new EventRequest();
  eventRequest.set("user", request.user);
  eventRequest.set("event", request.object);
  eventRequest.set("isAccepted", true);

  eventRequest.save()
  .then((eventRequest) => {
    // Execute any logic that should take place after the object is saved.
    console.error('New object created with objectId: ' + eventRequest.id);
  }, (error) => {
    // Execute any logic that should take place if the save fails.
    // error is a Parse.Error with an error code and message.
    console.error('Failed to create new object, with error code: ' + error.message);
  });
});

Parse.Cloud.beforeSave("EventRequest", (request) => {
  const relatedUser = request.object.get("user");
  const relatedEvent = request.object.get("event");

  if (!request.object.isNew()) {
    request.context = { isEditing: true };
    if (request.object.get("isAccepted") === true) {
      sendNotification(relatedUser, null, relatedEvent, NotificationType.eventRequestAccepted)
    }
  }
});

Parse.Cloud.afterSave("EventRequest", (request) => {

  const context = request.context;
  const relatedUser = request.object.get("user");
  const relatedEvent = request.object.get("event");

  if (context.isEditing === true) {
    return
  }

  relatedEvent.fetch().then((fetchedRelatedEvent) => {
    var forUser = fetchedRelatedEvent.get("createdBy")
    if (forUser.id === relatedUser.id) {
      return
    }
    sendNotification(forUser, relatedUser, relatedEvent, NotificationType.eventRequest);
  }, (error) => {
    // The object was not refreshed successfully.
    logger.log("Unable to fetch object");
  });
});

Parse.Cloud.beforeSave(Parse.User, async (request) => {

  if (request.object.get("settings") != null) {
    return;
  }

  request.context = { isCreatingSettings: true };

  const Settings = Parse.Object.extend("Settings");

  var settings = new Settings();

  await settings.save()

  request.object.set("settings", settings);
});

Parse.Cloud.afterSave(Parse.User, (request) => {
  var user = request.object;

  const context = request.context;

  if (context.isCreatingSettings === true) {
    var settings = request.object.get("settings")

    var acl = new Parse.ACL();
    acl.setReadAccess(user.id,true);
    acl.setWriteAccess(user.id, true);

    settings.setACL(acl);

    settings.save()
  }

});

// Delete

Parse.Cloud.beforeDelete("Event", (request) => {
  var EventRequest = Parse.Object.extend("EventRequest");

  var event = request.object;

  var queryEventRequest = new Parse.Query(EventRequest);
  queryEventRequest.equalTo("event", event);

  queryEventRequest.find()
  .then(function(eventRequests) {
    for (var i = 0; i < eventRequests.length; i++) {
      eventRequests[i].destroy()
    }
  })
  .catch(function(error) {
    logger.error("beforeDelete Event " + error.code + " : " + error.message);
  });
});

// Find

Parse.Cloud.beforeFind("Event", async (request) => {
  let query = request.query;
  query.include("createdBy");
});

Parse.Cloud.afterFind("Event", async (request) => {

  var events = request.objects;
  var user = request.user;

  if (request.master) {
    return events;
  }

  const EventRequest = Parse.Object.extend("EventRequest");

  var fixedObjects = [];

  for (var i = 0; i < events.length; i++) {
    var event = events[i];

    var userRequests = [];
    if (user != null) {

      const userRequestsQuery = new Parse.Query(EventRequest);
      userRequestsQuery.equalTo("user", user);
      userRequestsQuery.equalTo("event", event);
      userRequestsQuery.equalTo("isAccepted", true);
      userRequests = await userRequestsQuery.first();

      if (userRequests != null) {
        event.set("isAttending", true);
        fixedObjects.push(event);
        continue
      } else {
        event.set("isAttending", false);
      }
    }

    event.set("place", null);

    fixedObjects.push(event);
  }

  return fixedObjects;
});

// Extra functions
Parse.Cloud.define("recentEvents", async (request) => {
  const Event = Parse.Object.extend("Event");
  const queryEvent = new Parse.Query(Event);

  queryEvent.descending("createdAt");
  
  queryEvent.include("createdBy");
  queryEvent.include("place");

  const results = await queryEvent.find();
  return results;
});
